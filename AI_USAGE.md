# SplitSync - AI Assistance & Usage Report

This document details how AI assistance was leveraged to design, build, optimize, and harden SplitSync, including key prompts and debugging cases.

---

## 1. AI Tools Used
* **Primary AI Engine**: **Antigravity by Google DeepMind**, a powerful agentic AI pair-programming assistant.
* **Secondary Tooling**: Integrated IDE agent environments running asynchronous terminals, linters, and compilers.

---

## 2. Key Prompts & Iterations
* **System Design & Notion covers**: Propose a Notion-style cover page system for collaborative shared experiences, utilizing custom gradients and emojis to reframe standard expenses as contribution memories.
* **Ledger Hardening & Paise Math**: Refactor all ledger computations to scale inputs to integer paise (`Math.round(val * 100)`) at boundaries, allocating division remainders to the first active participant.
* **24-Category Anomaly Checker**: Implement a comprehensive checker mapping duplicate rows, timeline roster entries (joined/left bounds), missing currencies, and invalid split types.
* **CSV Import Staging**: Construct a client-side staging wizard that allows users to fuzzy-map names, backdate members, select duplicate actions, and confirm database commits via a Dry Run overlay.

---

## 3. Concrete Cases of AI Errors and Solutions

### Case 1: Over-Simplified Math in the Fairness Explainer Engine
* **What the AI did wrong**: The AI originally assumed every expense was split equally among participants. It generated a hardcoded math explanation string showing `"Math: ₹Total / N"` for all contributions inside the explainability details bubble.
* **How we caught it**: During UI review, when looking at transactions with custom split types (`unequal`, `percentage`, or `share`), the explainer printed a simple division formula that didn't match the actual values logged.
* **What we changed**: Refactored the math engine in `GroupDetail.tsx` to read the true split type. It now dynamically outputs custom formula strings depending on the sharing logic (e.g., portion counts for shares, percentages for percentage splits, and user sums for unequal splits).

### Case 2: Unresolved CSV Split Descriptor `"equal"` Created as a Guest Member
* **What the AI did wrong**: In the CSV staging name resolution, any text name that didn't match an existing roster or system user was added to `unresolvedNames` for auto-creation. If the columns were mapped incorrectly, split descriptors like `"equal"` were added as guest member profiles.
* **How we caught it**: The user noticed a member named `"equal"` with status "Imported" in their group roster, after a CSV mapping shift occurred.
* **What we changed**:
  1. Defined a list of `RESERVED_WORDS` (including `equal`, `unequal`, `percentage`, `share`, `inr`, `usd`, `eur`, `gbp`).
  2. Updated `anomalyDetector.ts` to flag reserved keywords in the payer or participant columns as critical column-mapping errors (`invalid_payer_name` and `invalid_participant_name`) instead of treating them as unregistered users.
  3. Filtered keywords out of fuzzy mapping and bulk user creation lists inside `CSVImportModal.tsx`.
  4. Ran a database cleanup script to delete the accidental `"equal"` user from the database.

### Case 3: Missing Schema Column Reference Failures in Modals
* **What the AI did wrong**: The AI authored manual contribution inserts in `ExpenseModal.tsx` and manual resolution inserts in `SettlementModal.tsx` that directly referenced `currency_code` and `exchange_rate` columns.
* **How we caught it**: When testing the app on a legacy database schema (where these multi-currency columns don't exist), saving manual forms threw a `400 Bad Request` from Supabase: `Could not find the 'currency_code' column of 'Settlement' in the schema cache`.
* **What we changed**:
  1. Enhanced the global `checkIsLegacySchema()` function inside `supabase.ts` to verify the existence of the `currency_code` column on the `Settlement` table.
  2. Updated the forms in both modals to check this legacy status and dynamically exclude `currency_code` and `exchange_rate` fields from the query insert payloads on legacy databases.
