# Structured JSON output schema (design note)

No phase-1-2 code produces this JSON — no extraction, NER, clause
classification, relation extraction, risk detection, or missing-clause
detection exists yet. This document exists so the `key_findings` field
reserved on `documents.key_findings` (a nullable `Json` column) is
populated with the *intended* shape once those phases exist, without a
schema renegotiation at that point.

`schema_version` stays `"1.0"` when `key_findings` is added — this is
an additive field on the existing per-document JSON output, not a
breaking change.

## `key_findings` shape

```json
{
  "key_findings": {
    "summary": "one to three sentence plain-language overview",
    "critical_terms": [
      { "label": "Monthly Rent", "value": "₹32,000", "evidence": { "text_start": 0, "text_end": 0 } }
    ],
    "flagged_risks": [
      { "severity": "HIGH", "category": "string", "reason": "string", "evidence": { "text_start": 0, "text_end": 0 } }
    ],
    "missing_clauses": ["DISPUTE_RESOLUTION"],
    "requires_review": true
  }
}
```

Notes for the phase that implements this:

- `key_findings` must be generated **last**, after every other extraction
  step, since `flagged_risks` and `missing_clauses` depend on the risk
  engine and missing-clause detector respectively.
- `evidence` objects reuse the provenance shape from
  `docs/architecture/provenance.md` (canonical text offsets at minimum;
  visual/page provenance when available).
- `missing_clauses` values should be drawn from whatever controlled
  clause-type vocabulary the clause-classification phase settles on —
  the synthetic dataset's clause labels (`document_clauses.clause_type`,
  currently free text) are a reasonable starting vocabulary; see e.g.
  `LEASE_DURATION`, `TERMINATION`, `DISPUTE_RESOLUTION`,
  `ENCUMBRANCE_DECLARATION` in `research/data/synthetic/*.labels.json`.
- Any statistic surfaced through `key_findings` (or anywhere else) that
  was computed on `is_synthetic = true` documents only must be clearly
  labeled as synthetic wherever it is shown — never presented as evidence
  of real-world performance. See `docs/architecture/evaluation_design.md`.
- `requires_review` is a simple boolean the UI can use to sort/flag
  documents; the threshold logic that sets it (e.g. "any HIGH severity
  risk, or any missing required clause") belongs to the risk-engine
  phase, not this one.

## Entity/clause label vocabulary observed in the synthetic dataset

For reference, the synthetic generator (`research/generator/generator.py`,
`research/generator/value_pools.py`) already encodes a working
entity/clause ontology for both document types. A future NER/clause
classification phase should treat this as a starting point, not a final
ontology — it was hand-built for template generation, not derived from
real documents (see `research/data/synthetic/dataset_card.md`'s "Known
limitations").

Observed entity labels include (non-exhaustive, see the generator source
for the authoritative list): `LESSOR`, `LESSEE`, `LANDLORD`, `TENANT`,
`ADDRESS`, `RENT`, `SECURITY_DEPOSIT`, `DURATION`, `SURVEY_NUMBER`,
`LAND_AREA`, `LAND_USE_TYPE`, `LAND_USE_RESTRICTION`, `LEASE_PREMIUM`.

Observed clause labels include: `LEASE_DURATION`, `LEASE_PREMIUM`,
`RENT_PAYMENT`, `LAND_USE_RESTRICTION`, `ENCUMBRANCE_DECLARATION`,
`TERMINATION`, `DISPUTE_RESOLUTION`, `JURISDICTION`.
