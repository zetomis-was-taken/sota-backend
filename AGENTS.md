# AGENTS.md

Museum management demo on Supabase/Postgres with an Express.js + TypeScript backend.

## Principles

- **Keep code and changes minimal.** Only change what the task requires; avoid unrequested refactors, abstractions, or features.
- **Respect demo scope.** Do not add features listed as out of scope in `docs/database-design.md` §10 (real payments, refunds, audit logs, account deletion, capacity limits, etc.) unless explicitly requested.

## Architecture & Docs

- **Database:** Read `docs/database-design.md` before any DB work (schema, migrations, SQL, RLS, RPCs, queries, types, seeds).
- **API:** Read `docs/api-contract.md` before any endpoint, query, RPC, or client data call work.
- **Constraints:** One museum per cart/order, one entry code per ticket purchase, fixed time slots (no capacity limits), fake payments, VND only. Keep the API Supabase-native (`/rest/v1`, `/auth/v1`, `/storage/v1`); do not add custom endpoints or a second auth layer without updating both `docs/api-contract.md` and `docs/database-design.md`.
- **Keep docs in sync:** `docs/` is the source of truth. Update affected docs concisely (in English) in the same change and state why; flag code bugs instead of documenting them as intended behavior.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — `tsc`
- `npm run dev` — `tsx watch src/index.ts`
- `npm start` — `node dist/index.js`
