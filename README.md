# noted

A private notes app built with React, Vite and Tailwind, using Supabase for login and storage. Deployed on Vercel.

## Setup

1. In Supabase, open **SQL Editor**, paste `supabase/schema.sql` and run it. This creates the `notes` table and the rules that keep each user's notes private.
2. Copy `.env.example` to `.env.local` and fill in the Project URL and publishable key from **Project Settings -> API**.
3. On Vercel, add the same two variables under **Settings -> Environment Variables**.

## Run locally

```
pnpm install
pnpm dev
```

Then open http://localhost:5173.
