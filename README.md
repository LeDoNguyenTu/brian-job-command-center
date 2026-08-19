# Brian Job Command Center

A private job search and application dashboard built with Next.js, Vinext, and Supabase.

## Features

- Independent email, password, and passkey authentication
- Administrator-only access enforced by Supabase Row Level Security
- Direct application, profile, and resume management
- Scheduled and on-demand discovery from public Greenhouse and Lever company boards
- URL-based duplicate protection enforced in PostgreSQL
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

Apply the SQL files in `supabase/migrations/` in filename order. Deploy `supabase/functions/discover-jobs/index.ts` with custom request authentication for scheduled discovery. Deploy `supabase/functions/sync-notion/index.ts` as an authenticated Edge Function if Notion backup is needed.

For a new Supabase project, set the private scheduled function URL after applying the migrations:

```sql
update private.discovery_config
set function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/discover-jobs',
    updated_at = now()
where id = 1;
```

The website uses Supabase as its primary data source. Notion is optional and is never required for normal dashboard editing.
