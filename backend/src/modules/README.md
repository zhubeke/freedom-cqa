# Backend module boundaries

Step 1 implements only `health` and `system`. Future ingestion, conversation query, evaluation, checklist, scoring, reporting, appeals, analytics, and processing modules belong in separate folders under this directory and must expose their own routes/services rather than reaching into another module's internals.
