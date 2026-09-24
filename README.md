# TripSplit

TripSplit is a travel expense management app for groups who want to track shared costs, split bills fairly, and settle balances without spreadsheets.

It is built as a Vite + React + TypeScript application with Supabase-backed auth and persistent trip storage. Users can create trips, invite members, add expenses, choose split methods, review balances, confirm manual payments, and export/share trip summaries.

## Features

- Create and manage multiple trips
- Invite and track trip members
- Add, edit, and delete expenses
- Support multiple split strategies for shared bills
- Automatically calculate balances and simplified debt settlements
- Record and confirm manual payments
- Review trip activity, analytics, and budget summaries
- WhatsApp-style message previews for reminders and statements
- User authentication via Supabase
- Local cache fallback for faster repeated access

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase for auth and relational data storage
- Tailwind CSS v4 for styling
- Recharts for analytics visuals
- Lucide React for icons
- Google GenAI integration (present in dependencies)
- Node + npm/bun tooling

## Project Structure

```text
TripSplit/
├── .github/                 # GitHub-specific config
├── assets/                  # Static assets
├── scripts/                 # Helper scripts
├── src/
│   ├── components/          # App views, modal screens, reusable UI
│   ├── context/             # Auth, theme, notification provider logic
│   ├── utils/               # calculations, storage, Supabase client, exports
│   ├── App.tsx              # Main app orchestration
│   ├── main.tsx             # App bootstrap
│   ├── types.ts             # Core domain types
│   └── index.css            # Base styles
├── supabase/
│   └── migrations/          # RLS and database integrity migrations
├── .env.example             # Environment variable template
├── index.html               # Vite entry HTML
├── package.json             # Scripts and dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
├── bun.lock                 # Bun lockfile
├── package-lock.json        # npm lockfile
├── metadata.json            # Project metadata
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- A Supabase project
- A browser for local development

### 1. Install dependencies

Using npm:

```bash
npm install
```

Using Bun:

```bash
bun install
```

### 2. Configure environment variables

Copy the example environment file and fill in your project values:

```bash
cp .env.example .env
```

Then update the values in `.env`:

```env
GEMINI_API_KEY="your_key"
APP_URL="http://localhost:5173"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
POSTGRES_URL="postgresql://..."
POSTGRES_URL_NON_POOLING="postgresql://..."
```

### 3. Set up Supabase database

The app includes migration files in `supabase/migrations/`.

Apply them with Supabase CLI if you are using the CLI locally:

```bash
supabase db push
```

If you are using the hosted Supabase SQL editor, run the migration SQL scripts in order:

1. `001_enable_rls.sql`
2. `002_owner_only_invite_code.sql`
3. `003_data_integrity_constraints.sql`

### 4. Run the app

Development mode:

```bash
npm run dev
```

Or with Bun:

```bash
bun run dev
```

The app will start in Vite's local development server and usually become available at:

```text
http://localhost:5173
```

## Available Scripts

From `package.json`:

```bash
npm run dev      # start Vite dev server
npm run build    # run TypeScript + production build
npm run start    # preview production build on port 3000
npm run preview  # preview locally on port 3000
npm run clean    # remove dist and server.js
npm run lint     # TypeScript no-emit validation
```

## Runtime Notes

- Authentication is handled through Supabase auth.
- Trip data is synced through Supabase and also cached in `localStorage` per user for faster loading and offline-friendly recovery.
- The app expects a valid Supabase connection and correct environment variables before it can authenticate or load trips.
- The codebase contains a strong focus on trip ownership and access isolation, especially in the Supabase RLS policies.

## Main App Flow

The application is organized around a single primary app shell in `src/App.tsx` and a set of feature-focused views under `src/components/`:

- Home dashboard
- Expenses list
- Settlement/balance view
- People and member management
- Activity log
- Analytics
- Invite / join trip flows
- Settings and profile modals

## Security and Data Integrity

This project includes database-level safety rules via Supabase migrations:

- Row-level security policies for users and trip data
- Trip membership checks
- Expense amount validation
- Split sum validation triggers
- Payment status enforcement

## Notes

- The project currently includes a Supabase-backed data model but does not appear to include a full automated test suite.
- Some features rely on environment-specific secrets and external service configuration, so local setup may require credentials from your Supabase and AI configuration.

## License

This project does not currently declare an explicit license in the repository metadata.

## Contributing

To contribute:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run the project checks (`npm run build` or `npm run lint`)
5. Open a pull request

