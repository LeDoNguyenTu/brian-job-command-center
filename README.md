# Brian Job Command Center

A private job search and application dashboard built with Next.js and Supabase, deployed independently on Vercel.

## Features

- Independent email, password, and passkey authentication
- Administrator-only access enforced by Supabase Row Level Security
- Direct application, profile, and resume management
- Scheduled and on-demand discovery from public Greenhouse and Lever company boards
- URL-based duplicate protection enforced in PostgreSQL
- Private DOCX and PDF resume storage
- Deterministic baseline resume fit scores with green, yellow, and red guidance
- Job-specific external prompt copy for use with any document service
- On-demand one-page ATS resume and cover letter PDF generation
- Gemini or custom OpenAI-compatible provider settings secured in Supabase Vault
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

Vercel uses the standard Next.js build command. The current Supabase URL and publishable key are safe public defaults in `lib/supabase.ts`, so production builds do not depend on environment setup. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel only when overriding the project for another environment.

## Database

Apply the SQL files in `supabase/migrations/` in filename order. Deploy `supabase/functions/discover-jobs/index.ts` with custom request authentication for scheduled discovery. Deploy `supabase/functions/tailor-documents/index.ts` with JWT verification for private prompt preparation and on-demand PDF generation. Deploy `supabase/functions/sync-notion/index.ts` as an authenticated Edge Function if Notion backup is needed.

The migrations intentionally contain no personal profile values or private workspace URLs. After applying them to a new project, replace the placeholder administrator before creating the account:

```sql
update public.app_admins
set email = lower('YOUR_ADMIN_EMAIL')
where email = 'admin@example.com';
```

For a new Supabase project, set the private scheduled function URL after applying the migrations:

```sql
update private.discovery_config
set function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/discover-jobs',
    updated_at = now()
where id = 1;
```

The website uses Supabase as its primary data source. Notion is optional and is never required for normal dashboard editing. The production site is `https://brian-job.vercel.app`.
