# AGENTS.md

## Project

Museum management demo on Supabase/Postgres with an Express.js + TypeScript backend.

## Database work

- **Read `docs/database-design.md` before any task that involves the database.** This includes schema changes, migrations, Drizzle definitions, SQL, RLS policies, RPCs, queries, generated types, and seed data.
- Treat `docs/database-design.md` as the source of truth for tables, enums, constraints, indexes, authorization, and transaction behavior.
- Follow the demo constraints defined there: one museum per cart/order, one entry code per ticket purchase, fixed time slots with no capacity limits, fake payments, and VND only.
- If an implementation needs to differ from the design, update `docs/database-design.md` in the same change and state why.
- Features listed as out of scope in `docs/database-design.md` §10 (real payments, refunds, audit log, account deletion, capacity limits, etc.) must not be added unless explicitly requested.

## API work

- **Read `docs/api-contract.md` before any task that involves an endpoint, query, RPC, or client data call.** This includes routes, request/response shapes, headers, auth requirements, error handling, and generated client types.
- Treat `docs/api-contract.md` as the source of truth for the HTTP surface: method, path, parameters, payloads, responses, status/error semantics, and required role.
- If code changes alter the API, update `docs/api-contract.md` in the same change and state why. Do not let the contract drift; agents may freely edit it.
- The API is Supabase-native (`/rest/v1`, `/auth/v1`, `/storage/v1`). Do not add custom endpoints or a second authorization layer without updating this contract and `docs/database-design.md`.
- Features out of scope in `docs/database-design.md` §10 get no endpoints.

## Documentation

- Documentation is a living artifact. Agents may freely update files under `docs/` so they accurately reflect the code.
- When code and documentation disagree, fix the documentation as part of the same change. If the discrepancy looks like a code bug rather than stale docs, flag it instead of documenting the bug as intended behavior.
- Keep documentation concise and in English.

## Verification

- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Build: `npm run build` (`tsc`)
- Dev server: `npm run dev` (`tsx watch src/index.ts`)
- Start compiled server: `npm start` (`node dist/index.js`)
