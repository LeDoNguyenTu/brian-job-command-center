# Brian Job Command Center

A private job search and application dashboard built for a single administrator. It combines job discovery, application tracking, resume management, sponsorship filtering, salary planning, and Notion synchronization in one responsive interface.

## Main features

- Secure email and password authentication through Supabase
- Passkey registration and sign-in
- Administrator-only access enforced with row-level security
- Application pipeline and job status tracking
- Sponsorship, work arrangement, language, and eligibility filters
- Resume variant management
- Salary and S Pass planning information
- Encrypted Notion integration token storage
- Live synchronization with a Notion applications database
- Responsive desktop and mobile interface

## Technology

- React 19 and Next.js-compatible routing
- TypeScript
- Supabase Auth, Postgres, Vault, and Edge Functions
- Vinext, Vite, and Cloudflare Workers
- Drizzle ORM for optional local D1 development

## Requirements

- Node.js 22.13 or newer
- A Supabase project
- Linux or a compatible shell environment for the included build scripts

## Environment variables

Copy `.env.example` to `.env.local` and provide your public Supabase connection values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Never commit `.env.local`, service-role keys, passwords, passkeys, or Notion tokens.

## Local development

```bash
npm ci
npm run dev
```

The local server uses the Vite and Cloudflare development environment defined in `vite.config.ts`.

## Database setup

Apply the migrations in order:

```text
supabase/migrations/202608190001_job_command_center.sql
supabase/migrations/202608190002_harden_notion_token_rpc.sql
```

The schema restricts application data to the configured administrator email and protects the Notion token with Supabase Vault.

## Notion synchronization

Deploy `supabase/functions/sync-notion/index.ts` as a Supabase Edge Function. Configure the function environment with the standard Supabase URL, anonymous key, and service-role key. The administrator enters the Notion integration token inside the dashboard, where it is encrypted before storage.

Share the target Notion database with the integration before running the first synchronization.

## Commands

```bash
npm run dev
npm run lint
npm test
npm run build
npm run validate:artifact
```

`npm test` creates a production build, validates the deployment artifact, and checks the rendered dashboard response.

## Security notes

- Keep the repository private if personal resume or application data is added later.
- Use only the publishable Supabase key in browser code.
- Keep the service-role key inside the Edge Function environment.
- Keep row-level security enabled for all private tables.
- Disable public account registration after creating the administrator account.
- Review Supabase security advisors after every schema change.

## Project structure

```text
app/                 Interface and application logic
lib/                 Supabase browser client
supabase/functions/  Notion synchronization function
supabase/migrations/ Database schema, policies, and secure functions
tests/               Rendered application checks
worker/              Cloudflare worker entrypoint
build/ and scripts/  Build and deployment helpers
```

## License

Private project. All rights reserved.
