# AGENTS.md

## Project

Museum management demo on Supabase/Postgres. The repository currently contains design documentation; application code has not been added yet.

## Database work

- **Read `docs/database-design.md` before any task that involves the database.** This includes schema changes, migrations, Drizzle definitions, SQL, RLS policies, RPCs, queries, generated types, and seed data.
- Treat `docs/database-design.md` as the source of truth for tables, enums, constraints, indexes, authorization, and transaction behavior.
- Follow the demo constraints defined there: one museum per cart/order, one entry code per ticket purchase, fixed time slots with no capacity limits, fake payments, and VND only.
- If an implementation needs to differ from the design, update `docs/database-design.md` in the same change and state why.
- Do not use `docs/database-design.md` as the current design. It is the older, longer draft and is superseded by `docs/database-design.md`.
- Features listed as out of scope in `docs/database-design.md` §10 (real payments, refunds, audit log, account deletion, capacity limits, etc.) must not be added unless explicitly requested.

## Documentation

- Documentation is a living artifact. Agents may freely update files under `docs/` so they accurately reflect the code.
- When code and documentation disagree, fix the documentation as part of the same change. If the discrepancy looks like a code bug rather than stale docs, flag it instead of documenting the bug as intended behavior.
- Keep documentation concise and in English.

## Verification

- No build or test tooling is configured in this repository yet. If tooling is added, record the exact commands in this file.
