# TripSplit

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6" />
  <img src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
</p>

TripSplit is a modern travel expense tracker built for groups who want to split shared spending fairly, track who owes what, and settle balances without messy spreadsheets.

It combines a polished React frontend with Supabase-powered authentication and storage to help travelers:

- create trips and invite friends
- log shared expenses quickly
- split bills by different methods
- compute balances automatically
- review activity and analytics
- confirm manual settlements
- share trip updates with group members

## Why TripSplit

Travel groups often lose track of who paid for what, especially when expenses are split unevenly across multiple people. TripSplit solves that by turning a trip into a lightweight financial workspace:

- one shared source of truth for trip costs
- automatic debt simplification
- clear member balance visibility
- a fast, mobile-first experience

## Features

- Multiple trip management
- Member invitations and trip ownership tracking
- Add, edit, and delete expenses
- Flexible split models for fair billing
- Real-time balance calculation and debt settlement suggestions
- Manual payment recording and confirmation flow
- Activity timeline for trip events
- Trip analytics dashboard
- Notification center and WhatsApp-style reminders
- Authenticated user profiles via Supabase
- Local cache fallback for smooth repeated usage

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase
- Tailwind CSS v4
- Recharts
- Lucide React
- Google GenAI dependencies
- Postgres-backed relational schema with RLS policies

## Project Structure

```text
TripSplit/
├── .github/                   # GitHub workflow/config metadata
├── assets/                    # Static app assets
├── scripts/                   # Supporting scripts
├── src/
│   ├── components/            # Views, modals, UI widgets
│   ├── context/               # Auth, notifications, theme context
│   ├── utils/                 # calculations, storage, supabase client, export logic
│   ├── App.tsx                # Main application shell
│   ├── main.tsx               # React app entry
│   ├── types.ts               # Shared domain models
│   └── index.css              # Base styling
├── supabase/
│   └── migrations/            # SQL migrations for auth, RLS, constraints
├── .env.example               # Environment template
├── .gitignore
├── index.html                 # Vite HTML entry
├── metadata.json              # App metadata
├── package.json               # Scripts and dependencies
├── package-lock.json          # npm lockfile
├── bun.lock                   # Bun lockfile
├── tsconfig.json              # TypeScript settings
├── vite.config.ts             # Vite configuration
├── README.md                  # Project documentation
└── LICENSE                    # optional if added later
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or Bun
- A Supabase project with authentication enabled
- Access to required environment variables

### 1. Install dependencies

Using npm:

```bash
npm install
```

Using Bun:

```bash
bun install
```

### 2. Set up environment variables

Copy the sample env file:

```bash
cp .env.example .env
```

Then fill in your values:

```env
GEMINI_API_KEY="your_gemini_api_key"
APP_URL="http://localhost:5173"

VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
POSTGRES_URL="postgresql://..."
POSTGRES_URL_NON_POOLING="postgresql://..."
```

> The app reads the Supabase URL and keys from these variables, so they must be valid before login, trip loading, or database writes will work.

### 3. Set up the database

The repository includes migrations under `supabase/migrations/`.

If using Supabase CLI:

```bash
supabase db push
```

If applying manually in the Supabase SQL editor, run the migration scripts in this order:

1. `supabase/migrations/001_enable_rls.sql`
2. `supabase/migrations/002_owner_only_invite_code.sql`
3. `supabase/migrations/003_data_integrity_constraints.sql`

These migrations enable:

- Row Level Security for trip data
- user/profile isolation
- trip membership checks
- expense validation rules
- split sum integrity checks

### 4. Run the app

Development mode:

```bash
npm run dev
```

Or with Bun:

```bash
bun run dev
```

The app will typically run at:

```text
http://localhost:5173
```

## Scripts

From `package.json`:

```bash
npm run dev      # start the Vite dev server
npm run build    # TypeScript + Vite production build
npm run start    # preview build on port 3000
npm run preview  # preview app on port 3000
npm run clean    # remove dist/server files
npm run lint     # TypeScript no-emit check
```

## App Workflow

The application is structured around a central shell in `src/App.tsx` and a set of feature modules in `src/components/`:

- Home dashboard
- Expenses list
- Settlement and balances
- Analytics
- People and member management
- Activity log
- Trip hub and invite flow
- User profile and notifications

The app uses a hybrid model:

- Supabase stores the authoritative trip records and auth state
- browser `localStorage` keeps a per-user cached snapshot for faster load and recovery

## Security and Data Integrity

This project takes a stronger-than-average approach to app security for a side project:

- RLS policies on users, trips, expenses, members, payments, and activities
- trip access checks based on owner membership and member lists
- validation constraints for positive amounts and supported split types
- enforcement that expense splits match the total amount within a tolerance

## Example User Journey

1. Create a new trip
2. Add travel companions as members
3. Log hotel, food, transport, and activity expenses
4. Choose the correct split model
5. Review who owes whom
6. Confirm settlements when money changes hands
7. Export or share trip status with the group

## Notes

- The repository does not currently include a formal automated test suite.
- Some features depend on valid Supabase configuration and external secrets, especially for authentication and any AI integrations.
- The app is best suited for a single-user or small-group travel use case rather than a large multi-tenant system.

## License

This project does not yet declare a repository license in the current metadata. If you plan to publish or distribute it publicly, consider adding a license file.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run validation checks (`npm run build` or `npm run lint`)
5. Submit a pull request

## Project Status

TripSplit is currently a feature-rich MVP with a strong focus on travel finance workflows, polished UI, and database-backed persistence. It is well suited to further development as a real-world product if you later add more tests, onboarding content, and stronger production hardening.

