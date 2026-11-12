# AGENTS.md

Museum management demo on Supabase/Postgres with an Express.js + TypeScript backend.

## Principles

- **Keep code and changes minimal.** Only change what the task requires; avoid unrequested refactors, abstractions, or features.
- **Respect demo scope.** Do not add features listed as out of scope in `docs/database-design.md` §10 (real payments, refunds, audit logs, account deletion, capacity limits, etc.) unless explicitly requested.

## Architecture & Docs

- **Database:** Read `docs/database-design.md` before any DB work (schema, migrations, SQL, triggers, queries, transactions, types, seeds).
- **API:** Read `docs/api-contract.md` before any Express endpoint, middleware, validation, or client data call work.
- **Auth:** Read `docs/auth-guide.md` before any authentication, role/membership check, or authorization middleware work.
- **Constraints:** One museum per cart/order, one entry code per ticket purchase, fixed time slots (no capacity limits), fake payments, VND only. Keep the architecture application-centric: Express.js + TypeScript owns the REST API (`/api/v1`) and business logic via Drizzle ORM (`DATABASE_URL`), **Supabase Auth** handles authentication, and **Supabase Storage** stores media. Do not expose direct client PostgREST (`/rest/v1`) data writes or add a second auth provider without updating `docs/api-contract.md`, `docs/auth-guide.md`, and `docs/database-design.md`.
- **Keep docs in sync:** `docs/` is the source of truth. Update affected docs concisely (in English) in the same change and state why; flag code bugs instead of documenting them as intended behavior.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — `tsc`
- `npm run dev` — `tsx watch src/index.ts`
- `npm start` — `node dist/index.js`
