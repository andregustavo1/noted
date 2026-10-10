# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Who and what this is for

Noted is a personal notes app with **one user: its creator**. Every feature exists to solve his own problems, not a general audience's. Don't add multi-user, onboarding, i18n, or "what if other people use it" concerns. The UI is in Portuguese (pt-BR).

Target platforms, in priority order:
1. **iPhone Safari as a home-screen app** ("Add to Home Screen", PWA standalone mode). The device is an **iPhone 15 Pro Max on iOS 27.0.1**: a modern phone with a current WebKit (120Hz ProMotion, `linear()` easing, View Transitions, `@property`), so there's no need to cater to old iOS versions. This is the main way it's used. Any UI change must work there: no Safari bars, safe areas, the on-screen keyboard, touch (no hover), iOS-specific quirks.
2. **Chrome on desktop.**

Desktop Chrome rendering correctly doesn't prove a change works on the iPhone PWA. Check iOS behavior explicitly.

## Commands

Package manager is pnpm, Node 24 (`.nvmrc`).

```bash
pnpm install
pnpm dev        # Vite on :5173 (.claude/launch.json runs it with --host so the phone can reach it on the LAN)
pnpm build      # vite build -> dist/
pnpm lint       # eslint .
pnpm preview
```

There are no tests. Env: copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Without them the app renders a "Supabase não configurado" screen. Deployed on Vercel (`vercel.json`: SPA rewrite to `index.html`, `no-cache` on `sw.js`, immutable `/assets/`).

## Architecture

React 18 + Vite + Tailwind (`darkMode: "class"`, `hoverOnlyWhenSupported`) + Supabase (auth + Postgres). There are two routes, `/login` and `/dashboard`. Almost all app logic lives in `src/pages/Home/Home.jsx` and `src/components/Cards/NoteEditor.jsx`.

### Offline-first data flow (the core design)
- `src/lib/queue.js`: everything shown is cached in localStorage under `noted:<userId>:cache`. Every change is applied locally first and appended to a per-user op queue (`noted:<userId>:queue`). Ops on the same note merge into one slot. Only the latest settings op is kept. Slot number `n` plus merge count `v` let a flush tell whether the op it sent is still current. IDs are generated on the device (`uuid()`), so notes and categories exist before the server knows about them.
- `src/lib/sync.js`: `flush(userId)` replays the queue in order. A network-type error (`isNetworkError`, which includes 401) stops the pass and keeps the op. Any other error drops the op and reports it. `flushedSince` lets a fetch that was already in flight re-apply ops that landed during it.
- `Home.jsx`: debounced flush after each `addOp`, plus a flush on `online`, a reload when the app becomes visible, and a flush when it's hidden (home-screen apps keep running in the background). Fetched server data always gets `applyQueue` laid over it so pending local changes survive.
- `src/lib/notes.js` and `categories.js`: thin Supabase calls wrapped in `unwrap` (`supabase.js`), which attaches the HTTP status to the error (0 = request never got through).
- `src/context/AuthContext.jsx` reads the stored `sb-*-auth-token` directly so the app opens offline with an expired access token.

### Data model (`supabase/schema.sql`, rerunnable, RLS per user)
- `notes`: title, content, category (**stored by name**, not FK), color, is_pinned. A trigger bumps `updated_at` only on title/content/category changes, so pinning and recoloring don't reorder notes. The client never sends timestamps.
- `categories`: unique `(user_id, name)`. Renaming or deleting a category also updates `notes.category`.
- Settings live in Supabase `user_metadata.settings` (`src/lib/settings.js`) and are mirrored to localStorage so `index.html` can apply theme and primary color before React renders (no flash).

### Note content format
Content is newline-separated lines. `src/lib/lines.js` parses each line's prefix: tab indent, then optional alignment (`<c> `/`<r> `/`<j> `), then optional list marker (`- `, `- [ ] `, `1. `, `#`–`###`). Inline styling is a tiny HTML subset (`<b><i><u><s>`) sanitized by `src/lib/richtext.js`. `sanitize` must stay idempotent or contentEditable rows reset while typing. The editor and the card previews share `lineStyle`, `lineGap`, and `headingSize`, so they render identically.

### iOS / PWA specifics (don't break these)
- `index.html`: the inline script sets `--app-height`. It only follows resizes that grow the viewport or rotate it, because the keyboard shrinks it and iOS standalone mode may never restore it. Layouts use `var(--app-height, 100dvh)` instead of `100vh`. The NoteEditor uses the visualViewport height while typing.
- Pinch zoom is blocked through `gesture*` events, since iOS ignores `user-scalable=no` in standalone mode. `<body ontouchstart="">` makes `:active` fire on iOS.
- `public/sw.js` (prod only): stale-while-revalidate for navigations and shell files, cache-first for hashed `/assets/`. Supabase requests aren't intercepted. Bump `CACHE` when shell files change. A new deploy shows up on the *following* app open.
- `public/manifest.webmanifest`: `start_url: /dashboard`, standalone mode.
