# Brian Job Command Center

A private job search and application dashboard built with Next.js, Vinext, and Supabase.

## Features

- Independent email, password, and passkey authentication
- Administrator-only access enforced by Supabase Row Level Security
- Direct application, profile, and resume management
- Private DOCX and PDF resume storage
- S Pass salary planning
- Optional one-way Notion backup

## Local development

Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.

```bash
npm ci
npm run dev
```

Run the checks before publishing:

```bash
npm test
npm run lint
```

## Database

Apply the SQL files in `supabase/migrations/` in filename order. Deploy `supabase/functions/sync-notion/index.ts` as an authenticated Edge Function if Notion backup is needed.

The website uses Supabase as its primary data source. Notion is optional and is never required for normal dashboard editing.
