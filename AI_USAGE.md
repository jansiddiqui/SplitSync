# SplitSync - AI Assistance & Usage Report

This document details how AI assistance was leveraged to design, build, and harden SplitSync.

---

## 1. Collaboration Model
SplitSync was developed through an agentic pair-programming workflow:
* **The User** acted as the Product Owner and Principal QA, providing direct feedback, reviewing implementation plans, and executing migrations.
* **Antigravity (AI Agent)** acted as the Lead Software Architect and Systems Hardening Engineer, proposing technical designs, refactoring modules, resolving type warnings, and verifying calculations.

## 2. Workflows Assisted by AI
1. **Mathematical Ledger Verification**: Writing and verifying the integer math conversions, Greedy Debt Simplification, and floating-point conversion tests.
2. **24-Category Anomaly Detection**: Distilling complex spreadsheet validation checks into structured typescript rules in `anomalyDetector.ts`.
3. **Migration and RPC Authoring**: Writing the relational database constraints, soft-delete triggers, indices, and the atomic transactional RPC function.
4. **Resilient Integrations**: Refactoring direct Supabase client calls to leverage database transactions with graceful client-side fallbacks.
5. **Engineering Documentation**: Structuring scoping, decisions, and system architecture audit reports to align with production-readiness reviews.
6. **Staging Safety & Roster Timeline Validation**: Designing the transient frontend resolution store (`pendingUsersToCreate`), validating user chronological boundaries (e.g. joined/left boundaries), and compiling the pre-commit dry-run summary aggregates.
