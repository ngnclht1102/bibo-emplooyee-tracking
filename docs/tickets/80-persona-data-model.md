# 80 — Persona data model (backend)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 81

## Goal
Persist persona on accounts and businesses so signup and onboarding can adapt.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md).

## Scope
- New goose migration `0000X_personas.sql`:
  - `ALTER TABLE users ADD COLUMN account_type text NOT NULL DEFAULT 'manager'
    CHECK (account_type IN ('manager','parent'));`
  - `ALTER TABLE businesses ADD COLUMN kind text NOT NULL DEFAULT 'team'
    CHECK (kind IN ('team','family'));`
  - Clean `-- +goose Down` reversing both.
- Update store structs/queries to read & write the new columns
  (`internal/store/store.go`, `internal/store/owner.go`).
- No behaviour change for existing rows — defaults keep current owners as
  `manager` / `team`.

## Acceptance criteria
- [ ] Migration applies up and rolls back down cleanly on a populated DB.
- [ ] Existing users/businesses default to `manager` / `team`.
- [ ] CHECK constraints reject any value outside the enums.
- [ ] Store reads/writes the new columns; no other endpoint behaviour changes yet.
