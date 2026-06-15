# SplitSync - Project Scope & CSV Audit Document

This document defines the functional boundaries, database schema structures, and the CSV Anomaly Audit Log of the SplitSync application.

---

## 1. Functional Scope

### In-Scope (Core Engine & Hardening)
1. **Authentication & Security**: Support for user registrations, session management, and Row-Level Security (RLS) policies.
2. **Timeline-Bound Memberships**: Tracking group enrollment boundaries (`joined_at` and `left_at` timestamps). Prevent historical calculations from affecting past/future group members.
3. **Advanced CSV Import & Staging**:
   - Client-side custom CSV lexer (`csvParser.ts`) mapping column mapping selections.
   - Transient local staging state (`pendingUsersToCreate`) for resolving unknown names.
   - Interactive batch duplicate radio resolutions (Keep Both, Keep Current, Keep Previous).
   - Anomaly Audit Summary Panel showing counts grouped by 6 validation categories.
   - Import Dry-Run Confirmation Modal detailing counts of database operations.
4. **24-Category Anomaly Detection Engine**:
   - **Duplicate**: `duplicate_expense`, `duplicate_settlement`, `duplicate_but_conflicting_records` (batch duplicates tagged with matching indices).
   - **Membership**: `user_not_in_group`, `expense_before_member_joined`, `expense_after_member_left`, `unknown_participant`.
   - **Currency**: `currency_mismatch`, `missing_exchange_rate`.
   - **Missing Data**: `empty_description`, `missing_payer`, `missing_participants`, `invalid_date`, `invalid_amount`, `future_date`, `ambiguous_date_format`.
   - **Split Validation**: `invalid_split_type`, `conflicting_split_schema`, `split_total_mismatch`, `percentage_total_!=_100`, `share_total_=_0`, `negative_amount`, `refund_transaction`, `precision_anomaly`, `format_anomaly`, `outlier_amount`.
   - **Settlement Validation**: `settlement_logged_as_expense`, `expense_logged_as_settlement`, `self_settlement`.
5. **Multi-Currency Engine**: Custom exchange rates stored per expense, converting foreign transactions to the group base currency.
6. **Explainability Engine**: Transparent step-by-step breakdown of user balances, currency math, timeline checks, and the Greedy Debt Simplification path.
7. **Integer-Based Mathematics**: Cents/Paise calculations (`value * 100`) to avoid floating-point drift.

### Out-of-Scope (Explicitly Excluded)
1. **Direct Email/SMS Dispatch**: Invitation records are created and resolved within the application's dashboard rather than using external SMTP/Twilio channels.
2. **Push Notifications**: Live updates are driven via WebSockets (`postgres_changes` subscription); push notifications (WebPush/APNS) are out of scope.
3. **Receipt Parsing & OCR**: Financial data is imported via spreadsheets or manual forms; OCR receipt scans are not supported.

---

## 2. CSV Anomaly Audit Log (42 Records Audited)

SplitSync was audited and validated against standard CSV import files. Below are the anomalies identified and the actions taken:

| Row Date | Description | Payer | Amount | Anomaly Category | Resolution Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **08-02-2026** | Dinner at Marina Bites | Dev | 3,200.00 | **User not in group** | Mapped to system user Dev and auto-joined them to the group on commit. |
| **08-02-2026** | dinner - marina bites | Dev | 3,200.00 | **Duplicate expense** | Selected `Discard Current` in the staging editor. |
| **10-02-2026** | Electricity Feb | Aisha | "1,200" | **Format anomaly** | Stripped string quotes and commas and parsed value to float. |
| **15-02-2026** | Cylinder refill | Rohan | 899.995 | **Precision anomaly** | Rounded to 2 decimal places (`899.99`) and allocated remainder paise to Rohan. |
| **18-02-2026** | Groceries DMart | Priya S | 1,875.00 | **Fuzzy Participant** | Fuzzy-matched `"Priya S"` to `"Priya"` in local roster. |
| **22-02-2026** | House cleaning supplies | *Empty* | 780.00 | **Missing Payer** | Quick-selected `"Aisha"` in the staging dropdown. |
| **25-02-2026** | Rohan paid Aisha back | Rohan | 5,000.00 | **Settlement logged as expense** | Auto-detected keywords and imported as a `Settlement` record. |
| **28-02-2026** | Pizza Friday | Aisha | 1,440.00 | **Percentage total mismatch** | Clicked `🪄 Normalize Percentages to 100%` (reallocated Aisha 27.27%, etc.). |
| **09-03-2026** | Goa villa booking | Dev | 540.00 | **Currency mismatch** | Converted USD to INR using an exchange rate of `83.0`. |
| **10-03-2026** | Beach shack lunch | Rohan | 84.00 | **Currency mismatch** | Converted USD to INR at `83.0` exchange rate. |
| **11-03-2026** | Parasailing | Dev | 150.00 | **Unknown participant** | Auto-created a placeholder guest profile for `"Dev's friend Kabir"` on commit. |
| **11-03-2026** | Thalassa dinner | Rohan | 2,450.00 | **Duplicate but conflicting** | Checked against DB, allowed user choice to keep both or skip. |
| **12-03-2026** | Parasailing refund | Dev | -30.00 | **Negative amount** | Imported as a `Refund` transaction (negative offset split). |
| **Mar-14** | Airport cab | Rohan | 1,100.00 | **Invalid date format** | Fuzzy-parsed `"Mar-14"` as March 14, 2026. |
| **15-03-2026** | Groceries DMart | Priya | 2,105.00 | **Missing currency** | Defaulted to base currency `INR`. |
| **22-03-2026** | Swiggy Swiggy | Priya | 0.00 | **Zero amount** | Flagged as warning, allowed user to import or discard. |
| **02-04-2026** | Groceries BigBasket | Priya | 2,640.00 | **Post-Departure Split** | Excluded `"Meera"` from the split because she left the group on March 28. |
| **08-04-2026** | Sam deposit share | Sam | 15,000.00 | **Settlement logged as expense** | Imported as a `Settlement` record, verified and bypassed pending queue. |
| **18-04-2026** | Furniture for common room | Aisha | 12,000.00 | **Conflicting split schema** | Handled by parsing portion shares despite equal split type. |
| **01-02-2026** | Rent & Bills | Rohan | 48,000.00 | **Timeline Bound blocker** | Backdated Roster Join Dates (`Resolve Join Dates` button) to `2026-01-01`. |

---

## 3. Database Schema

SplitSync is built on a PostgreSQL schema optimized for RLS, timelines, and audit compliance.

### 1. Table: `User`
Stores system users and guest profiles.
* `id`: UUID (Primary Key)
* `name`: TEXT (Not Null)
* `email`: TEXT (Unique, Not Null)

### 2. Table: `Group`
Stores collaborative experiences.
* `id`: UUID (Primary Key)
* `name`: TEXT (Not Null)
* `created_by`: UUID REFERENCES `User`(id)
* `created_at`: TIMESTAMPTZ
* `base_currency`: VARCHAR(3) (Default 'INR')

### 3. Table: `GroupMember`
Links users to groups and tracks timeline boundaries.
* `id`: UUID (Primary Key)
* `group_id`: UUID REFERENCES `Group`(id) ON DELETE CASCADE
* `user_id`: UUID REFERENCES `User`(id) ON DELETE CASCADE
* `role`: TEXT (Default 'member')
* `joined_at`: TIMESTAMPTZ (Default NOW())
* `left_at`: TIMESTAMPTZ (Nullable - Marks soft removal)

### 4. Table: `Expense`
Stores group financial contribution memories.
* `id`: UUID (Primary Key)
* `group_id`: UUID REFERENCES `Group`(id) ON DELETE CASCADE
* `title`: TEXT (Not Null)
* `description`: TEXT
* `amount`: NUMERIC(12, 2) (Check >= 0)
* `paid_by`: UUID REFERENCES `User`(id)
* `created_at`: TIMESTAMPTZ
* `deleted_at`: TIMESTAMPTZ (Nullable - Soft Delete)
* `currency_code`: VARCHAR(3) (Default 'INR')
* `exchange_rate`: NUMERIC(12, 6) (Default 1.0, Check > 0)

### 5. Table: `ExpenseSplit`
Stores individual splits for an expense.
* `id`: UUID (Primary Key)
* `expense_id`: UUID REFERENCES `Expense`(id) ON DELETE CASCADE
* `user_id`: UUID REFERENCES `User`(id)
* `amount`: NUMERIC(12, 2) (Check >= 0)
* `percentage`: NUMERIC(5, 2) (Nullable)
* `share_count`: NUMERIC(8, 2) (Nullable)
* `split_type`: TEXT (Check in 'equal', 'unequal', 'percentage', 'share')

### 6. Table: `Settlement`
Stores debt resolutions.
* `id`: UUID (Primary Key)
* `group_id`: UUID REFERENCES `Group`(id) ON DELETE CASCADE
* `payer_id`: UUID REFERENCES `User`(id)
* `receiver_id`: UUID REFERENCES `User`(id)
* `amount`: NUMERIC(12, 2) (Check >= 0)
* `created_at`: TIMESTAMPTZ
* `deleted_at`: TIMESTAMPTZ (Nullable - Soft Delete)
* `currency_code`: VARCHAR(3) (Default 'INR')
* `exchange_rate`: NUMERIC(12, 6) (Default 1.0, Check > 0)

### 7. Table: `UnregisteredMember`
Tracks imported placeholder profiles that are pending signup invites.
* `id`: UUID (Primary Key)
* `group_id`: UUID REFERENCES `Group`(id) ON DELETE CASCADE
* `display_name`: TEXT (Not Null)
* `placeholder_user_id`: UUID REFERENCES `User`(id)
* `real_email`: TEXT
* `invited_by`: UUID REFERENCES `User`(id)
* `invite_sent_at`: TIMESTAMPTZ
* `status`: TEXT (Check in 'pending', 'invited', 'joined')

### 8. Table: `AuditLog`
Stores transactional audit history automatically populated by triggers.
* `id`: UUID (Primary Key)
* `table_name`: TEXT (Not Null)
* `record_id`: UUID (Not Null)
* `action`: TEXT (Not Null - 'INSERT', 'UPDATE', 'DELETE')
* `old_data`: JSONB
* `new_data`: JSONB
* `performed_by`: UUID REFERENCES `auth.users`(id)
* `created_at`: TIMESTAMPTZ
