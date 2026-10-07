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
