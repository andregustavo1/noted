-- Noted database setup.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

create table if not exists public.notes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title text not null default '',
    content text not null default '',
    category text not null default '',
    is_pinned boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Card color on the dashboard ('' = white).
alter table public.notes add column if not exists color text not null default '';

create index if not exists notes_user_id_idx on public.notes (user_id);

-- Keep updated_at current on content edits; color/pin changes keep the note's place in the list.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if (new.title, new.content, new.category) is distinct from (old.title, old.content, old.category) then
        new.updated_at = now();
    end if;
    return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
    before update on public.notes
    for each row execute function public.set_updated_at();

-- Each user can only see and change their own notes.
alter table public.notes enable row level security;

drop policy if exists "Users can read their own notes" on public.notes;
create policy "Users can read their own notes" on public.notes
    for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own notes" on public.notes;
create policy "Users can create their own notes" on public.notes
    for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes" on public.notes
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes" on public.notes
    for delete to authenticated using ((select auth.uid()) = user_id);

-- Categories live on their own so one can exist before it has notes. notes.category keeps the name.
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

alter table public.categories enable row level security;

drop policy if exists "Users manage their own categories" on public.categories;
create policy "Users manage their own categories" on public.categories
    for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- Categories that already exist on notes become rows, so nothing disappears from the dashboard.
insert into public.categories (user_id, name)
select distinct user_id, category from public.notes where category <> ''
on conflict do nothing;

-- Two-step verification: once the account has a verified TOTP factor, a session signed in with only the password
-- (aal1) gets nothing. The error is a 401 (PostgREST maps SQLSTATE PT401) rather than an empty result, so a device
-- still on an old aal1 token keeps its queued changes and cache (sync.js treats 401 as the connection's) until it
-- shows the code screen.
create or replace function public.require_mfa()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
        and exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified') then
        raise sqlstate 'PT401' using message = 'MFA required';
    end if;
    return true;
end;
$$;

drop policy if exists "Require MFA when enrolled" on public.notes;
create policy "Require MFA when enrolled" on public.notes
    as restrictive for all to authenticated using ((select public.require_mfa()));

drop policy if exists "Require MFA when enrolled" on public.categories;
create policy "Require MFA when enrolled" on public.categories
    as restrictive for all to authenticated using ((select public.require_mfa()));

-- Task reminders (push notifications) ---------------------------------------------------------------------------
-- A task line may carry "<@2026-10-09T18:00:00.000Z w> " after its box (src/lib/lines.js). Saving a note rebuilds
-- its rows in reminders; every minute pg_cron calls the send-reminders Edge Function, which sends what's due.
-- One-time setup (once, in the SQL Editor), so the cron job knows where the function lives:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per device that turned notifications on. tz is the device's zone, so repeats keep the local hour.
create table if not exists public.push_subscriptions (
    endpoint text primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    p256dh text not null,
    auth text not null,
    tz text not null default 'America/Sao_Paulo',
    created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;
create policy "Users manage their own push subscriptions" on public.push_subscriptions
    for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- Derived from notes.content by the trigger below; no policies, only the trigger and the send function touch it.
create table if not exists public.reminders (
    id bigint generated always as identity primary key,
    note_id uuid not null references public.notes (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    body text not null,
    base_at timestamptz not null,
    repeat text not null default '',
    remind_at timestamptz not null
);

create index if not exists reminders_remind_at_idx on public.reminders (remind_at);

alter table public.reminders enable row level security;

-- The first time after `after` that a reminder rings: base itself, or base plus whole days/weeks/months/years in
-- the device's zone (a monthly one on the 31st rings on the last day of shorter months). Null when it never will.
create or replace function public.next_occurrence(base timestamptz, rep text, tz text, after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
    step interval := case rep when 'd' then interval '1 day' when 'w' then interval '1 week'
        when 'm' then interval '1 month' when 'y' then interval '1 year' end;
    t timestamptz := base;
    k int := 0;
begin
    if step is null then
        return case when base > after then base end;
    end if;
    -- ponytail: one step at a time from base (no drift on short months); ~365 loops per year of daily repeats
    while t <= after loop
        k := k + 1;
        t := ((base at time zone tz) + step * k) at time zone tz;
    end loop;
    return t;
end;
$$;

create or replace function public.reminder_tz(uid uuid)
returns text
language sql
stable
set search_path = ''
as $$
    select coalesce((select tz from public.push_subscriptions where user_id = uid order by created_at desc limit 1),
        'America/Sao_Paulo');
$$;

-- Rebuilds a note's reminders from its content. Ticked one-time tasks don't ring; repeating ones (routines) still do.
-- A line it can't read is skipped: a reminder must never stop a note from saving.
create or replace function public.sync_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.reminders where note_id = new.id;
    begin
        insert into public.reminders (note_id, user_id, body, base_at, repeat, remind_at)
        select new.id, new.user_id, body, base_at, rep, next_at
        from (
            select at as base_at, rep, done,
                coalesce(nullif(btrim(replace(replace(replace(replace(regexp_replace(html, '<[^>]*>', '', 'g'),
                    '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&amp;', '&')), ''), 'Lembrete') as body,
                public.next_occurrence(at, rep, public.reminder_tz(new.user_id), now()) as next_at
            from (
                select m[1] <> ' ' as done, m[2]::timestamptz as at, coalesce(m[3], '') as rep, m[4] as html
                from regexp_matches(new.content,
                    '^\t*(?:<[crj]> )?[-*–] \[([ xX])\] <@(\d{4}-\d\d-\d\dT[0-9:.]+Z)(?: ([dwmy]))?> (.*)$', 'gn') as m
            ) lines
        ) parsed
        where next_at is not null and (not done or rep <> '');
    exception when others then
        raise warning 'sync_reminders skipped note %: %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists notes_sync_reminders on public.notes;
create trigger notes_sync_reminders
    after insert or update of content on public.notes
    for each row execute function public.sync_reminders();

-- Reminders written before this trigger existed.
update public.notes set content = content where content like '%<@%';

-- Takes what's due: one-time reminders are removed, repeating ones move to their next time. Called by the Edge
-- Function with the service role only.
create or replace function public.claim_due_reminders()
returns table (user_id uuid, note_id uuid, title text, body text)
language sql
security definer
set search_path = ''
as $$
    with due as (
        select * from public.reminders where remind_at <= now() for update skip locked
    ), gone as (
        delete from public.reminders r using due where r.id = due.id and due.repeat = ''
    ), moved as (
        update public.reminders r
        set remind_at = public.next_occurrence(due.base_at, due.repeat, public.reminder_tz(due.user_id), now())
        from due where r.id = due.id and due.repeat <> ''
    )
    select due.user_id, due.note_id, n.title, due.body from due join public.notes n on n.id = due.note_id;
$$;

revoke execute on function public.claim_due_reminders() from public, anon, authenticated;

-- Every minute. Sending only takes what's already due, so the function needs no secret of its own.
select cron.schedule('send-reminders', '* * * * *', $$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
            || '/functions/v1/send-reminders'
    );
$$);
