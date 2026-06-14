# SplitSync - Project Scope Document

This document defines the functional boundaries, design constraints, and technical parameters of the SplitSync application.

---

## 1. Functional Scope

### In-Scope (Core Engine & Hardening)
1. **Authentications**: Support for user registrations, session management, and roster sync via Supabase Auth.
2. **Timeline-Bound Memberships**: Tracking group enrollment boundaries (`joined_at` and `left_at` timestamps). Prevent historical calculations from affecting past/future group members.
3. **Advanced CSV Import & Staging**:
   - Client-side CSV parser (`csvParser.ts`) mapping custom spreadsheets.
   - Transient local staging state (`pendingUsersToCreate`) for resolving unknown names without schema pollution.
   - Interactive batch duplicate radio resolutions (Keep Both, Keep Current, Keep Previous).
   - Anomaly Audit Summary Panel showing counts grouped by 6 validation categories.
   - Import Dry-Run Confirmation Modal detailing counts of Users, Memberships, Expenses, Settlements, Skipped Rows, Warnings, and Critical Blockers prior to DB execution.
4. **24-Category Anomaly Detection Engine**:
   - **Duplicate**: `duplicate_expense`, `duplicate_settlement`, `duplicate_but_conflicting_records` (batch duplicates tagged with matching indices).
   - **Membership**: `user_not_in_group`, `expense_before_member_joined`, `expense_after_member_left`, `unknown_participant` (blocker).
   - **Currency**: `currency_mismatch`, `missing_exchange_rate`.
   - **Missing Data**: `empty_description`, `missing_payer`, `missing_participants`, `invalid_date`, `invalid_amount`, `future_date`, `ambiguous_date_format`.
   - **Split Validation**: `invalid_split_type`, `conflicting_split_schema`, `split_total_mismatch`, `percentage_total_!=_100`, `share_total_=_0`, `negative_amount`, `refund_transaction`, `precision_anomaly`, `format_anomaly`, `outlier_amount`.
   - **Settlement Validation**: `settlement_logged_as_expense`, `expense_logged_as_settlement`, `self_settlement`.
5. **Multi-Currency Engine**: Custom exchange rates stored per expense, converting foreign transactions to the group base currency (defaulting USD to a realistic `83.0` rate to avoid 1:1 fallbacks).
6. **Explainability Engine**: Transparent step-by-step breakdown of user balances, currency math, timeline checks, and the Greedy Debt Simplification path.
7. **Database-Level Integrity**:
   - RLS policies restricting read/write scopes to active group members.
   - Constraints preventing negative values or empty categories.
   - DB Triggers and Audit log capture (`AuditLog` table).
   - Transactional atomic writes via database RPC (`create_expense_with_splits`) with a transparent client-side fallback.
   - Soft deletes using `deleted_at` timestamps instead of record purging.
8. **Integer-Based Mathematics**: Cents/Paise calculations to avoid floating-point drift in ledger totals.

### Out-of-Scope (Explicitly Excluded)
1. **Direct Email/SMS Dispatch**: Invitation records are created and resolved within the application's dashboard rather than using external SMTP/Twilio channels.
2. **Push Notifications**: Live updates are driven via WebSockets (`postgres_changes` subscription) while active; push notifications (WebPush/APNS) are out of scope.
3. **Receipt Parsing & OCR**: Financial data is imported via spreadsheets or manual forms; OCR receipt scans are not supported.
4. **Auto-Generated Recurring Bills**: Subscriptions and monthly bills are logged manually; automated schedulers are excluded.
5. **Native Mobile App**: SplitSync is built as a highly responsive web application.
