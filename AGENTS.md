# AGENTS.md

## Project

Museum management demo on Supabase/Postgres. The repository currently contains design documentation; application code has not been added yet.

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

- **Local setup** (requires Docker or Podman):
  - Start local stack: `npx --yes supabase start`
  - Print local URL and anon key: `npx --yes supabase status -o env` (copy `.env.example` to `.env` and fill `SUPABASE_URL` and `SUPABASE_ANON_KEY`; never commit `.env` or expose `service_role`)
  - Stop local stack: `npx --yes supabase stop`
- **Migrations & seed**:
  - Reset local database and apply migrations + `supabase/seed.sql`: `npx --yes supabase db reset`
  - Apply pending migrations locally without resetting: `npx --yes supabase migration up`
  - Push migrations to linked remote project: `npx --yes supabase db push`
- **Tests**:
  - Database/RLS pgTAP tests (`supabase/tests/`): `npm run test:db` (`npx --yes supabase test db`)
  - HTTP integration tests (`tests/http/` against `/auth/v1`, `/rest/v1`, `/storage/v1`): `npm run test:http` (`node --env-file-if-exists=.env --test "tests/http/**/*.test.mjs"`)
  - Full suite: `npm test`
