# Adversarial test case design (design note — build in a later phase)

No generator or detection code for these cases is written in Phase 1-2.
`research/data/adversarial/` exists (with a `README.md` placeholder) but
is empty. This document specifies what will go there once a risk engine
and missing-clause detector exist to be tested against.

## Why standard test documents aren't enough

The synthetic dataset (`research/data/synthetic/`) tests whether parsing,
NER, and clause extraction are *correct* — does the system find the right
spans with the right labels. It does not test whether the **risk engine**
catches problems that are lexically unremarkable but substantively
concerning: a clause can be perfectly well-formed, unambiguous English,
and still shift risk onto a tenant/lessee in a way a plain NER/clause
classifier would never flag, because nothing about its *surface form* is
unusual. Adversarial test cases close that gap.

## Grading model

Every adversarial case must be constructed with a known, injected
`expected_flag` label at generation time (analogous to how the synthetic
generator's `verify_offsets()` guarantees exact entity/clause spans by
construction — see `research/generator/generator.py`), so it becomes an
automatically-gradable pass/fail test: run the pipeline, check whether
its output contains a flag matching `expected_flag`, no manual judgment
required per case.

## The five categories

### 1. Silent liability shift

Ordinary maintenance/repair language that in fact shifts an obligation
normally borne by one party (e.g. structural repairs, usually a
landlord's/lessor's responsibility) onto the other party, without any
lexically alarming words ("shall", "responsible for", "at their own
cost" — all unremarkable phrasing).

- **Construction**: take a known-safe maintenance clause template and
  swap the obliged party, keeping every other word identical, so the only
  difference between a safe and unsafe instance is *which party* a
  syntactically-identical obligation falls on.
- **`expected_flag`**: a risk of category `LIABILITY_SHIFT` (or
  equivalent) anchored to that clause's span.
- **Responsible component**: the risk engine (per-clause classification
  is enough here — the clause alone, correctly read, reveals the shift).

### 2. Asymmetric obligations

Differing notice periods, termination rights, or penalty terms between
the two parties, where each individual clause reads as unremarkable in
isolation — the asymmetry is only visible by comparing two clauses (e.g.
the landlord's termination clause vs. the tenant's) against each other.

- **Construction**: generate a document with two clauses governing the
  same kind of right/obligation for each party, deliberately parameterized
  with different values (e.g. landlord: 15-day notice to terminate;
  tenant: 60-day notice to terminate), each individually well-formed.
- **`expected_flag`**: a risk of category `ASYMMETRIC_OBLIGATION`
  referencing *both* clause spans (not just one).
- **Responsible component**: **not** the per-clause classifier — this
  requires a **cross-clause consistency checker**, a component that does
  not exist yet and is architecturally different from the rest of the
  pipeline (see "Architectural implication" below).

### 3. Vague discretionary language replacing an objective standard

E.g. security deposit deductions "as deemed fit by the Landlord" instead
of an itemized list or a capped percentage. Grammatically unremarkable;
high practical risk because it removes any objective standard the tenant
could hold the landlord to.

- **Construction**: a small closed set of known discretionary phrases
  ("as deemed fit by", "at the sole discretion of", "as determined
  solely by") substituted into an otherwise-standard deposit/deduction
  clause template, contrasted with control instances using an objective
  standard (itemized list, percentage cap).
- **`expected_flag`**: a risk of category `UNBOUNDED_DISCRETION` anchored
  to that clause's span.
- **Responsible component**: the risk engine (per-clause, via a phrase
  pattern or classifier trained to distinguish objective vs. discretionary
  standard language).

### 4. Cross-entity/cross-clause contradiction

E.g. a land lease whose `LAND_USE_TYPE` entity says "Agricultural" while
its permitted-use clause describes a use requiring non-agricultural
conversion (e.g. "horticultural plantation" framed as requiring
conversion, or an explicitly commercial/industrial use), with no
conversion clause present anywhere in the document.

- **Construction**: generate a document where the `LAND_USE_TYPE` entity
  value and the permitted-use clause's described use are deliberately
  inconsistent, and confirm (at generation time, the same way
  `verify_offsets()` confirms spans) that no `LAND_USE_CONVERSION` (or
  equivalent) clause is present in that instance.
- **`expected_flag`**: a risk of category `LAND_USE_CONTRADICTION`
  referencing both the entity and the clause.
- **Responsible component**: **not** per-clause classification — this
  requires comparing an **entity value against a separate clause's
  content**, which is the same cross-referencing architecture needed for
  category 2, just across entity/clause instead of clause/clause.

### 5. Clean absence

A document that is otherwise complete and well-formed but is simply
missing a clause the schema expects (e.g. no `DISPUTE_RESOLUTION`
clause), with no other signal anything is wrong — nothing to flag by
reading any single clause, because the problem is what *isn't* there.

- **Construction**: take a normally-complete generated document and
  omit exactly one required clause type, keeping every other clause
  and entity intact and internally consistent.
- **`expected_flag`**: a `missing_clauses` entry (per
  `docs/architecture/schema.md`'s `key_findings.missing_clauses`) naming
  the omitted clause type, using the schema's PRESENT/MISSING/UNCLEAR
  detection.
- **Responsible component**: the missing-clause detector (checks which
  expected clause types are absent from the document as a whole — this
  is a document-level check, not per-clause, but does not require
  comparing clauses/entities against each other the way categories 2 and
  4 do).

## Architectural implication — flag this now, not mid-implementation

Categories **2** and **4** require comparing multiple clauses, or an
entity against a clause, against each other. This is architecturally
different from per-clause classification, which is what most of the
extraction pipeline (NER, clause classification, single-clause risk
scoring) does — a per-clause classifier only ever sees one clause's text
at a time. Category 2/4 detection needs a component that has visibility
across an entire document's extracted entities and clauses at once (a
"cross-clause consistency checker"), which:

- cannot be implemented as "just another risk category" bolted onto the
  per-clause risk classifier — it needs a different input shape (a set of
  clauses/entities, not a single clause's text),
  and
- likely needs to run *after* NER, clause classification, and relation
  extraction have all completed for a document, since it depends on their
  combined output — this has ordering implications for the pipeline
  (consistent with `key_findings` also being generated last, per
  `docs/architecture/schema.md`).

The risk engine's design in whatever later phase builds it should account
for this from the start rather than discovering the need for a
document-wide comparison pass partway through implementation.
