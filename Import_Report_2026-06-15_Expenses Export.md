# SplitSync - Ingestion & Anomaly Audit Report

**Report Generated**: 6/15/2026, 9:39:11 AM
**Source File**: Expenses Export.csv
**Base Currency**: INR

## 1. Executive Ingestion Metrics

| Metric | Count / Value |
| :--- | :--- |
| **Total Raw Rows in CSV** | 42 |
| **Successfully Imported Transactions** | 39 |
| **Skipped/Discarded Rows** | 3 |
| **Total Volume Ingested (Base Currency)** | INR 329,509.00 |
| **Total Anomalies Detected & Resolved** | 0 |

## 2. Row-by-Row Ingestion & Resolution Log

Below is the audit log details of each row in the CSV file, showing the anomalies detected and resolutions applied:

| Row | Date | Description | CSV Payer | CSV Amount | Status | Resolution Details & Actions Taken |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 01-02-2026 | February rent | Aisha | INR 48000 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "01-02-2026" into valid calendar date 2/1/2026.<br/> **outlier amount**: Outlier: Amount (INR 48000.00) is >3x the average (INR 6804.30). (Resolved). |
| 2 | 03-02-2026 | Groceries BigBasket | Priya | INR 2340 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "03-02-2026" into valid calendar date 2/3/2026. |
| 3 | 05-02-2026 | Wifi bill Feb | Rohan | INR 1199 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "05-02-2026" into valid calendar date 2/5/2026. |
| 4 | 08-02-2026 | Dinner at Marina Bites | Dev | INR 3200 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "08-02-2026" into valid calendar date 2/8/2026. |
| 5 | 08-02-2026 | dinner - marina bites | Dev | INR 3200 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "08-02-2026" into valid calendar date 2/8/2026. |
| 6 | 2026-02-09 | Electricity Feb | Aisha | 200 1 | ❌ Skipped | Discarded/skipped from import.<br/> **User not in group**: Auto-joined user "Aisha" to group roster.<br/> **conflicting split schema**: Split type is equal, but custom split details/shares are provided. (Resolved).<br/> **Reserved Keyword Error**: Filtered invalid system reserved word from name mapping. |
| 7 | 12-02-2026 | Maid salary Feb | Meera | INR 3000 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "12-02-2026" into valid calendar date 2/12/2026. |
| 8 | 14-02-2026 | Movie night snacks | priya | INR 640 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 9 | 15-02-2026 | Cylinder refill | Rohan | INR 899.995 | ✅ Ingested (Expense) | **Precision Anomaly**: Rounded amount 899.995 to 2 decimals (899.995) and allocated remainder paise. |
| 10 | 18-02-2026 | Groceries DMart | Priya S | INR 1875 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 11 | 20-02-2026 | Aisha birthday cake | Rohan | INR 1500 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 12 | 22-02-2026 | House cleaning supplies |  | INR 780 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 13 | 25-02-2026 | Rohan paid Aisha back | Rohan | INR 5000 | ✅ Ingested (Settlement) | Mapped and imported as a Settlement debt resolution. |
| 14 | 28-02-2026 | Pizza Friday | Aisha | INR 1440 | ❌ Skipped | Discarded/skipped from import.<br/> **User not in group**: Auto-joined user "Aisha" to group roster.<br/> **User not in group**: Auto-joined user "Aisha" to group roster.<br/> **Percentage Split Mismatch**: Normalized percentages to equal exactly 100%. |
| 15 | 01-03-2026 | March rent | Aisha | INR 48000 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "01-03-2026" into valid calendar date 3/1/2026.<br/> **outlier amount**: Outlier: Amount (INR 48000.00) is >3x the average (INR 6804.30). (Resolved). |
| 16 | 03-03-2026 | Groceries BigBasket | Meera | INR 2810 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 17 | 05-03-2026 | Wifi bill Mar | Rohan | INR 1199 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "05-03-2026" into valid calendar date 3/5/2026. |
| 18 | 08-03-2026 | Goa flights | Aisha | INR 32400 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "08-03-2026" into valid calendar date 3/8/2026.<br/> **outlier amount**: Outlier: Amount (INR 32400.00) is >3x the average (INR 6804.30). (Resolved). |
| 19 | 09-03-2026 | Goa villa booking | Dev | USD 540 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "09-03-2026" into valid calendar date 3/9/2026. |
| 20 | 10-03-2026 | Beach shack lunch | Rohan | USD 84 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "10-03-2026" into valid calendar date 3/10/2026. |
| 21 | 10-03-2026 | Scooter rentals | Priya | INR 3600 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "10-03-2026" into valid calendar date 3/10/2026. |
| 22 | 11-03-2026 | Parasailing | Dev | USD 150 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "11-03-2026" into valid calendar date 3/11/2026. |
| 23 | 11-03-2026 | Dinner at Thalassa | Aisha | INR 2400 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "11-03-2026" into valid calendar date 3/11/2026. |
| 24 | 11-03-2026 | Thalassa dinner | Rohan | INR 2450 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "11-03-2026" into valid calendar date 3/11/2026. |
| 25 | 12-03-2026 | Parasailing refund | Dev | USD -30 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "12-03-2026" into valid calendar date 3/12/2026.<br/> **refund transaction**: Negative amount (₹-30) indicates a credit/refund transaction. (Resolved). |
| 26 | Mar-14 | Airport cab | rohan | INR 1100 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 27 | 15-03-2026 | Groceries DMart | Priya | INR 2105 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 28 | 18-03-2026 | Electricity Mar | Aisha | INR 1450 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 29 | 20-03-2026 | Maid salary Mar | Meera | INR 3000 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 30 | 22-03-2026 | Dinner order Swiggy | Priya | INR 0 | ✅ Ingested (Expense) | **negative amount**: Transaction amount is exactly zero. (Resolved). |
| 31 | 25-03-2026 | Weekend brunch | Meera | INR 2200 | ❌ Skipped | Discarded/skipped from import.<br/> **User not in group**: Auto-joined user "Meera" to group roster.<br/> **User not in group**: Auto-joined user "Meera" to group roster.<br/> **Percentage Split Mismatch**: Normalized percentages to equal exactly 100%. |
| 32 | 28-03-2026 | Meera farewell dinner | Aisha | INR 4800 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 33 | 04-05-2026 | Deep cleaning service | Rohan | INR 2500 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "04-05-2026" into valid calendar date 5/4/2026. |
| 34 | 01-04-2026 | April rent | Aisha | INR 48000 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "01-04-2026" into valid calendar date 4/1/2026.<br/> **outlier amount**: Outlier: Amount (INR 48000.00) is >3x the average (INR 6804.30). (Resolved). |
| 35 | 02-04-2026 | Groceries BigBasket | Priya | INR 2640 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "02-04-2026" into valid calendar date 4/2/2026. |
| 36 | 05-04-2026 | Wifi bill Apr | Rohan | INR 1199 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "05-04-2026" into valid calendar date 4/5/2026. |
| 37 | 08-04-2026 | Sam deposit share | Sam | INR 15000 | ✅ Ingested (Settlement) | Mapped and imported as a Settlement debt resolution.<br/> **Ambiguous Date**: Parsed date string "08-04-2026" into valid calendar date 4/8/2026.<br/> **Classification Error**: Transaction type auto-converted from Expense to Settlement based on keyword detection.<br/> **expense logged as settlement**: This peer settlement was logged in the expense schema. (Resolved). |
| 38 | 10-04-2026 | Housewarming drinks | Sam | INR 3100 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "10-04-2026" into valid calendar date 4/10/2026. |
| 39 | 12-04-2026 | Electricity Apr | Aisha | INR 1380 | ✅ Ingested (Expense) | **Ambiguous Date**: Parsed date string "12-04-2026" into valid calendar date 4/12/2026. |
| 40 | 15-04-2026 | Groceries DMart | Sam | INR 1990 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |
| 41 | 18-04-2026 | Furniture for common room | Aisha | INR 12000 | ✅ Ingested (Expense) | **conflicting split schema**: Split type is equal, but custom split details/shares are provided. (Resolved). |
| 42 | 20-04-2026 | Maid salary Apr | Priya | INR 3000 | ✅ Ingested (Expense) | Ingested clean with zero anomalies. |

---
*Report generated automatically by SplitSync Ingestion Engine.*