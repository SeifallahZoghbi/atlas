# School Super App — Setup Instructions

## Project Overview

A school operations and parent trust platform with:
- **Mobile App** (React Native / Expo): Parent and Teacher views
- **Web Admin** (Next.js): Admin dashboard
- **Driver App** (React Native / Expo): GPS tracking + status only
- **Backend**: Supabase (local development, cloud production)

Architecture: Multi-tenant SaaS (school_id on all tables)

---

## Prerequisites

Ensure these are installed:
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop (running)
- Supabase CLI (`brew install supabase/tap/supabase` or `npm install -g supabase`)
- Git
- GitHub CLI (`gh`) — optional but helpful
- Expo CLI (`npm install -g expo-cli`)

---

## 1. Initialize Monorepo

```bash
mkdir school-super-app
cd school-super-app
pnpm init
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create folder structure:
```bash
mkdir -p apps/mobile apps/admin-web apps/driver packages/shared packages/supabase
```

---

## 2. Initialize Git + GitHub

```bash
git init
```

Create `.gitignore`:
```
node_modules
.env
.env.local
.expo
dist
.next
.supabase
*.log
.DS_Store
```

Create GitHub repo and push:
```bash
gh repo create school-super-app --private --source=. --remote=origin
git add .
git commit -m "Initial monorepo structure"
git push -u origin main
```

---

## 3. Supabase Local Setup

```bash
cd packages/supabase
supabase init
```

This creates `/supabase` folder with `config.toml`.

Start local Supabase (Docker must be running):
```bash
supabase start
```

Note the output — save these locally:
- API URL: `http://127.0.0.1:54321`
- anon key
- service_role key
- Studio URL: `http://127.0.0.1:54323`

Create initial migration for multi-tenant schema:
```bash
supabase migration new init_schema
```

---

## 4. Multi-Tenant Schema Principles

Every table must include:
- `school_id UUID NOT NULL REFERENCES schools(id)`
- Row Level Security (RLS) policies scoped by school_id
- Indexes on school_id for all frequently queried tables

Core tables to establish:
```
schools
users (with role: parent | teacher | admin | driver)
students
student_guardians (links parents to students)
classes
class_enrollments
```

All feature tables (attendance, messages, feed_items, etc.) reference these and include school_id.

---

## 5. Mobile App Setup (Expo)

```bash
cd apps/mobile
npx create-expo-app@latest . --template expo-template-blank-typescript
```

Install essentials:
```bash
pnpm add @supabase/supabase-js react-native-url-polyfill
pnpm add @react-navigation/native @react-navigation/native-stack
pnpm add expo-secure-store
```

Create `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 6. Admin Web Setup (Next.js)

```bash
cd apps/admin-web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
```

Install Supabase:
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 7. Driver App Setup

```bash
cd apps/driver
npx create-expo-app@latest . --template expo-template-blank-typescript
```

Minimal dependencies — same Supabase setup as mobile, plus:
```bash
pnpm add expo-location expo-task-manager
```

---

## 8. Shared Package

```bash
cd packages/shared
pnpm init
```

Create `package.json`:
```json
{
  "name": "@school-super-app/shared",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

This will contain:
- TypeScript types (generated from Supabase)
- Shared constants
- Utility functions

---

## 9. Vercel Setup (Admin Web)

```bash
cd apps/admin-web
vercel link
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL` (will point to production Supabase later)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

For now, keep local development. Vercel deployment happens when you're ready for staging/production.

---

## 10. Root Package.json Scripts

Add to root `package.json`:
```json
{
  "scripts": {
    "dev:mobile": "pnpm --filter mobile start",
    "dev:admin": "pnpm --filter admin-web dev",
    "dev:driver": "pnpm --filter driver start",
    "db:start": "cd packages/supabase && supabase start",
    "db:stop": "cd packages/supabase && supabase stop",
    "db:reset": "cd packages/supabase && supabase db reset",
    "db:migrate": "cd packages/supabase && supabase migration up",
    "db:gen-types": "cd packages/supabase && supabase gen types typescript --local > ../shared/src/database.types.ts"
  }
}
```

---

## Development Workflow

1. Start Docker
2. `pnpm db:start` — launches local Supabase
3. Open Supabase Studio at `http://127.0.0.1:54323`
4. `pnpm dev:mobile` or `pnpm dev:admin` — run apps
5. After schema changes: `pnpm db:gen-types` — regenerate TypeScript types

---

## Notes for Claude Code

- Discuss build sequence and feature prioritization directly
- Reference `/mnt/user-data/uploads/school_super_app_v1_features.txt` for feature scope
- All schema changes via migrations (`supabase migration new <name>`)
- RLS policies are mandatory — no table without them
- Mobile app uses role-based navigation (parent vs teacher views)
