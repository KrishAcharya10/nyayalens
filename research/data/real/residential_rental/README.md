# Real residential rental agreements

This folder is empty by design — real documents have not been collected
yet (target: 15 residential rental agreements). All Phase 1-2 code runs
correctly with this folder empty; nothing in this repository assumes
files exist here.

## Before uploading anything here

**Pre-anonymize every file yourself before adding it.** Remove or redact
real names, addresses, phone numbers, email addresses, Aadhaar/PAN or any
other government ID numbers, bank account details, and signatures. This
project does not currently implement any automated PII redaction — treat
every file placed in `raw/` as something a human has already checked.

## Expected format

- Accepted formats: `.pdf`, `.docx`.
- Naming convention: `residential_rental_{four-digit-id}.pdf` (or
  `.docx`), e.g. `residential_rental_0001.pdf`. A later ingestion phase
  uses this naming convention as a fallback to auto-detect document type
  when metadata isn't otherwise available — it is not required, just
  helpful.

## Folder layout

- `raw/` — original uploaded files, exactly as provided (post-anonymization).
- `annotated/` — Label Studio exports (or equivalent) once real documents
  are annotated. Empty until an annotation phase exists.
