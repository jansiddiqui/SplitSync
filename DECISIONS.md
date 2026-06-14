# SplitSync - Key Architectural & Design Decisions

This document summarizes the core technical decisions, mathematical choices, and staging workflows implemented in SplitSync.

---

## 1. Client-Side Staging vs. Server-Side Processing
* **Decision**: All CSV processing, fuzzy name mappings, ratio normalizations, and anomaly validations are run on the client instead of using a server-side ingestion worker.
* **Rationale**: This gives the user immediate interactive control to resolve anomalies (e.g. mapping roster members, defining exchange rates, or correcting percentage splits) before records are written to the database. It prevents partially broken imports from corrupting the ledger.

## 2. Integer-Based Paise/Cents Financial Math
* **Decision**: All ledger math conversions parse floating-point currency units into integers (`value * 100`) at the engine boundaries.
* **Rationale**: Standard IEEE 754 double-precision floats exhibit rounding drift (e.g. `0.1 + 0.2 === 0.30000000000000004`). Converting currency values to integer paise keeps calculations 100% exact. Any division remainders are allocated dynamically to the first active transaction split participant to ensure the split sum matches the expense total.

## 3. Database Transaction RPC with Client-Side Fallback
* **Decision**: SplitSync uses a PostgreSQL transaction RPC (`create_expense_with_splits`) to commit parent expenses and child splits atomically. If the remote database has not yet been migrated, the frontend intercepts the failure and falls back to individual table insert queries.
* **Rationale**: Database triggers and checks verify the integrity of the data. If a split insert fails (e.g., due to RLS policies or check constraints), the entire transaction rolls back, preventing orphaned expense records. The client-side fallback ensures backward compatibility if database DDL migrations are pending.

## 4. Soft-Deletes Over Record Purging
* **Decision**: Deleted expenses and settlements write a `deleted_at` timestamp. Members who "leave" a group have their `left_at` column updated rather than being removed from `GroupMember`.
* **Rationale**: Purging database records would corrupt historical ledger balances. Retaining members and expenses with state tags allows the explainability engine to calculate correct historical balances while keeping them hidden from active dropdown rosters.

## 5. Database-Safe Staging & Unregistered Name Resolutions
* **Decision**: All unregistered user configurations (e.g. "Create User" options and date preferences) are maintained in transient frontend React state (`pendingUsersToCreate`). No insertions are sent to the `User` or `GroupMember` tables until the import is committed.
* **Rationale**: When staging a CSV with unknown users (such as "Aisha"), any database insertions during the upload phase would pollute production tables if the user decides to discard the import session. Postponing all database writes to a single transactional commit ensures clean data isolation.

## 6. Dynamic Join Date Selection Strategies
* **Decision**: When resolving an unregistered user, the system defaults the join date to their "First Expense Date" (the earliest date they appear in the CSV), with options for "Beginning of Group" or a "Custom Date".
* **Rationale**: Hardcoding a static join date (e.g. `2026-01-01`) is dangerous because it can bypass critical timeline validations for subsequent rows. Calculating the earliest appearance dynamically provides a logical, validator-compliant default while custom selection allows manual overrides.

## 7. Interactive Duplicate Resolution & Pre-Commit Dry Run
* **Decision**: For potential duplicate pairs (e.g., repeating expenses), instead of silently deleting rows, the UI presents radio selection controls for the user to choose between: "Keep Both", "Keep Current", or "Keep Previous". Before committing, a Dry Run Confirmation Overlay aggregates the total operations.
* **Rationale**: Silent database deletions violate the principle of deliberate data handling. Giving users interactive choices handles imperfect data safely. The dry-run confirmation modal provides clear visibility of the exact database insertions (Users, Memberships, Expenses, Settlements) about to take place, giving the user final verification.
