# SplitSync ⚡

SplitSync is a database-native, hardened expense-splitting web application. It is engineered with robust transaction safety, multi-currency conversion, user timeline validation, and a comprehensive client-side CSV staging area featuring 24 anomaly detection categories.

The interface is styled using TailwindCSS v4 with a custom Aurora Mint theme, presenting a modern, glassmorphic layout.

---

## 🚀 Getting Started

### 1. Database Migrations (Supabase)
SplitSync connects to a hosted PostgreSQL instance via Supabase. Before running the frontend, apply the migrations to your Supabase SQL editor:
1. Copy the contents of [`supabase_migration.sql`](file:///d:/Project/SpreeTail/SplitSync/supabase_migration.sql) and execute them in your Supabase SQL console. This sets up the timeline columns, currency tracking, and staging tables.
2. Copy the contents of [`supabase_migration_phase2.sql`](file:///d:/Project/SpreeTail/SplitSync/supabase_migration_phase2.sql) and execute them. This applies the database constraints, indexing optimization, RLS membership policies, triggers for the audit log, and the transaction RPC function `create_expense_with_splits`.

### 2. Frontend Configuration
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Create or verify the environment configuration file `.env`:
   ```env
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-anon-key"
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Spin up the local dev server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to the printed local port (e.g., `http://localhost:5173/` or `http://localhost:5174/`).

---

## 🛠 Tech Stack
* **Frontend**: React (Vite, TypeScript, TailwindCSS v4, Lucide Icons).
* **Database & BaaS**: PostgreSQL hosted on Supabase.
* **State & Authentication**: Supabase Auth, client-side React hooks.
* **Math & Utilities**: Custom CSV parser, fuzzy string mapper, decimal-to-integer paise converter, and Greedy Debt Simplification engine.

---

## 📂 Core Hardened Subsystems

### 1. CSV Import & Staging review
* **Parser**: A custom CSV lexer supporting double-quoted fields containing commas and multiple currency formats.
* **Fuzzy Mapping**: Replaces exact roster email checks with prefix/substring matching to map raw text names to user accounts (e.g. `"Priya S"` matches `"Priya"`).
* **Anomaly Detection**: Scans and flags 24 specific error categories (outliers, timeline boundaries, currency mismatches, percentages summing to other than 100%, and self-settlements).

### 2. Explainability & Fairness
* **Greedy debt Simplification**: Explains the flow of initial balances and the optimized repayment paths.
* **Integrity Audits**: The dashboard warns users if net balances do not sum to exactly zero (ledger parity check).
* **Audit Trail**: Every database change generates a revision log in the `AuditLog` table.

### 3. Transaction Safety (RPC)
* **Atomic Writes**: Creating an expense automatically rolls back both the expense and the splits if either insertion fails.
* **Client Fallback**: The client tries calling the transaction RPC first, falling back to individual table insert queries if the database migration has not yet been executed.

---

## 🤖 AI Used
This application was engineered, optimized, and hardened in collaboration with **Antigravity by Google DeepMind**, an agentic AI pair-programming partner. Detailed prompts, AI-assisted code revisions, and debugging logs are documented in [`AI_USAGE.md`](file:///d:/Project/SpreeTail/SplitSync/AI_USAGE.md).
