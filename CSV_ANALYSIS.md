# SplitSync — CSV Export Analysis (Phase 0)

This document details the systems-level analysis of `Expenses Export.csv` located in `C:\Users\hp\Downloads\Expenses Export.csv`. This analysis aligns our import and validation engines with the deliberate data anomalies embedded in the evaluation data.

---

## 1. Anomaly Inventory (42 Records Audited)

We audited all 42 transaction rows in the CSV file and identified the following anomaly mappings:

| Row Date | Description | Payer | Amount | Anomaly Category | Analysis & Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **08-02-2026** | Dinner at Marina Bites | Dev | 3,200.00 | **User not in group / Unknown Participant** | Dev is not part of the active flatmates roster. |
| **08-02-2026** | dinner - marina bites | Dev | 3,200.00 | **Duplicate expense** | Duplicate of the previous row (same date, amount, and payer; minor casing variation in title). |
| **10-02-2026** | Electricity Feb | Aisha | "1,200" | **Format anomaly** | Amount is string-wrapped with a thousands-separator comma. |
| **15-02-2026** | Cylinder refill | Rohan | 899.995 | **Precision anomaly** | Amount contains 3 decimal places (`899.995`), causing fractional paise rounding problems. |
| **18-02-2026** | Groceries DMart | Priya S | 1,875.00 | **Fuzzy Participant / Unknown name** | Payer is entered as "Priya S" instead of "Priya" (needs mapping rules). |
| **22-02-2026** | House cleaning supplies | *Empty* | 780.00 | **Missing Payer** | Payer cell is empty; ledger cannot allocate credit. |
| **25-02-2026** | Rohan paid Aisha back | Rohan | 5,000.00 | **Settlement logged as expense** | This is a peer-to-peer debt settlement, but has no split type or splits array. |
| **28-02-2026** | Pizza Friday | Aisha | 1,440.00 | **Percentage total mismatch** | Split percentages sum to `110%` (`Aisha 30%, Rohan 30%, Priya 30%, Meera 20%`). |
| **09-03-2026** | Goa villa booking | Dev | 540.00 | **Currency mismatch & Missing rate** | Currency is `USD` while group base is `INR`. No conversion rate is supplied. |
| **10-03-2026** | Beach shack lunch | Rohan | 84.00 | **Currency mismatch** | Transaction in `USD` instead of `INR`. |
| **11-03-2026** | Parasailing | Dev | 150.00 | **Unknown participant** | Split list includes "Dev's friend Kabir", who is not in the group roster. |
| **11-03-2026** | Thalassa dinner | Rohan | 2,450.00 | **Duplicate but conflicting records** | Same date and dining event as Aisha's "Dinner at Thalassa" (₹2400) but different payer/amount. |
| **12-03-2026** | Parasailing refund | Dev | -30.00 | **Negative amount / Refund** | Negative expense amount representing a transaction offset. |
| **Mar-14** | Airport cab | Rohan | 1,100.00 | **Invalid date format** | Date string is `"Mar-14"` instead of standard `DD-MM-YYYY`. |
| **15-03-2026** | Groceries DMart | Priya | 2,105.00 | **Missing currency** | Currency field is empty. |
| **22-03-2026** | Dinner order Swiggy | Priya | 0.00 | **Zero amount** | Amount is ₹0.00. |
| **25-03-2026** | Weekend brunch | Meera | 2,200.00 | **Percentage total mismatch** | Percentages sum to `110%` (`Aisha 30%, Rohan 30%, Priya 30%, Meera 20%`). |
| **04-05-2026** | Deep cleaning service | Rohan | 2,500.00 | **Ambiguous Date Format** | Date `04-05-2026` could be May 4th or April 5th depending on interpretation. |
| **02-04-2026** | Groceries BigBasket | Priya | 2,640.00 | **Expense after member left** | Meera left the group on March 28, but is included in the split list on April 2. |
| **08-04-2026** | Sam deposit share | Sam | 15,000.00 | **Expense logged as settlement** | Sam paid Aisha his deposit directly; this is a peer settlement. |
| **18-04-2026** | Furniture for common room | Aisha | 12,000.00 | **Conflicting split schema** | `split_type` is equal, but `split_details` contains ratios (`Aisha 1; Rohan 1; Priya 1; Sam 1`). |

---

## 2. Membership Timeline Events

The group undergoes two key membership transitions that dictate balance limits:

1. **Initial State (Feb 1 - Mar 27)**:
   * **Active Members**: Aisha, Rohan, Priya, Meera.
2. **Transition 1 (Meera Leaves - Mar 28)**:
   * Meera moves out.
   * **Roster action**: Set Meera's `left_at = '2026-03-28T00:00:00Z'`.
   * **Constraint**: Meera must not split any expenses created after March 28 (e.g. `02-04-2026 Groceries BigBasket` should exclude Meera).
3. **Transition 2 (Sam Joins - Apr 8)**:
   * Sam moves in.
   * **Roster action**: Set Sam's `joined_at = '2026-04-08T00:00:00Z'`.
   * **Constraint**: Sam must not be charged for any expenses logged before April 8 (e.g. February rents, Goa trips, March wifi bills).

---

## 3. Currency Events

Transactions contain currency codes that require unified conversion to the base currency (`INR`):
* **INR transactions**: Default group currency.
* **USD transactions**: 
  * `09-03-2026 Goa villa booking` (540 USD by Dev)
  * `10-03-2026 Beach shack lunch` (84 USD by Rohan)
  * `11-03-2026 Parasailing` (150 USD by Dev)
  * `12-03-2026 Parasailing refund` (-30 USD by Dev)
* **Missing currency code**: `15-03-2026 Groceries DMart` has an empty currency cell. (Expected policy: fallback to Group Base Currency `INR`).
* **Conversion policy**: Importer must prompt the user for an exchange rate if not present in the CSV row, or pull a default conversion mapping (e.g., USD to INR rate is ₹83.00) and lock it on the transaction.

---

## 4. Split Types Used

The CSV uses four distinct split models:
1. **Equal**: Split evenly across all listed participants (remainder rounded to the payer).
2. **Unequal**: Split by specific amounts designated per user.
3. **Percentage**: Split by custom percentage coefficients.
   * *Anomaly*: Pizza Friday and Weekend brunch have percentages summing to 110%. Importer must reject or prompt user to normalize back to 100%.
4. **Share**: Split by ratios.
   * *Example*: `Scooter rentals` split: Aisha 1, Rohan 2, Priya 1, Dev 2 (Total portions = 6).
   * *Example*: `Furniture for common room` contains portions despite split_type equal.

---

## 5. Settlement Patterns

Two transactions represent settlements rather than shared expenses:
1. `25-02-2026 Rohan paid Aisha back` (Rohan paid Aisha ₹5000 directly).
2. `08-04-2026 Sam deposit share` (Sam paid Aisha ₹15000 directly).

**Expected Import Policy**: Importer must detect these keywords (e.g., "paid back", "deposit share", or empty split types) and parse them as `Settlement` records rather than `Expense` records, ensuring they are not double-counted as expenses and splits.

---

## 6. Expected Import Policies & Auto-Resolutions

When committing these rows, our import workflow will execute these automated resolution checks:

```
                  [CSV Raw File]
                        │
                        ▼
                [Column Mapping]
                        │
                        ▼
           [Anomaly Detection Engine]
             ├── Duplicate Check ──> Warning (Allow manual skip / delete)
             ├── Outlier Check ───> Warning (Flag deviances > 3x average)
             ├── Payer Resolver ──> If blank, prompt for default group member
             └── Split Resolver ──> Normalize percentages to 100% or equal
                        │
                        ▼
             [Staging Review Workspace]
                        │
                        ▼
           [Atomic Transaction Commit]
```

### Resolution Rules:
* **Missing Payer**: User must select a payer in the staging screen.
* **Percentage != 100%**: Staging workflow auto-calculates normalized percentages or alerts user to adjust values.
* **User Not In Group / Unknown User**: Fuzzy map to database user (e.g. "Priya S" $\rightarrow$ "Priya"), create guest membership (e.g. "Dev" invited), or discard split share.
* **Negative Expense**: Convert to a Refund transaction (reducing the net amount owed by the participants to the payer).
* **Date Parsing**: Force ISO format. If date matches `Mar-14`, parse as March 14, 2026.
* **Unilateral Settlements**: Import as `Settlement` records and mark as `verified` (since they are imported from a master group export file, we bypass the pending validation stage for these verified records).
