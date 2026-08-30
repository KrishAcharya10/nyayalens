# Provenance: text offsets vs. visual coordinates

Every extracted fact in NyayaLens (an entity span, a clause span, a
relation, a risk finding, an obligation) must be traceable back to
exactly where it came from. This document defines the schema for that,
which is already reflected (as nullable fields, unpopulated) on
`DocumentClause`, `Entity`, `Relation`, `Risk`, and `Obligation` in
`packages/db/prisma/schema.prisma`. No extraction logic is implemented in
this phase — this is a schema/design document only.

## Two distinct representations, not one

1. **Canonical text provenance** — `text_start` / `text_end`: a character
   offset pair into the document's *canonical extracted text* (the string
   produced by whatever extraction step turns a `.txt`/`.docx`/`.pdf`
   into plain text, stored eventually in `documents.canonical_text`).
   This is exactly the representation the synthetic dataset already uses
   — see any `research/data/synthetic/*.labels.json` file, where every
   entity/clause is `{start, end, label, text}` offsets into that
   document's `.txt` content.

2. **Visual/page provenance** — `page_number`, `bbox_x`, `bbox_y`,
   `bbox_width`, `bbox_height`: a page number and a bounding box in the
   coordinate space of a *rendered* page (e.g. from a PDF rasterized to
   an image, or PDF layout/glyph-position extraction). All five fields
   are nullable and only get populated once a future phase does PDF
   layout extraction (OCR, or a PDF text-position library).

**These are not interchangeable and must never be assumed to be the
same fact expressed two ways.** A character offset from the canonical
text is computed from whatever text-extraction path was used for that
representation (e.g. `python-docx` for `.docx`, or a `.txt` file that was
authored directly, as in the synthetic dataset). PDF text extraction is a
separate process that can:

- reorder text (e.g. multi-column layouts, or text drawn out of visual
  order in the PDF's content stream),
- merge or split tokens differently than the canonical extractor did,
  depending on font/kerning/whitespace handling,
- drop or substitute characters the renderer treats specially (ligatures,
  soft hyphens, non-breaking spaces).

So a future phase that wants "the bounding box on the PDF page for entity
X" cannot simply reuse `text_start`/`text_end` as an index into the PDF's
own extracted text — it needs its own alignment step (e.g. matching
extracted-PDF-text spans back to canonical-text spans by content, not by
offset), which is out of scope for Phase 1-2 and not implemented.

## Why both are reserved now

Retrofitting a second provenance representation onto every one of these
five tables later would mean a migration touching every derived-sample
table simultaneously, plus updating every consumer of the existing
canonical-offset-only shape to handle a schema version bump. Reserving
both now, nullable, costs nothing today (every field defaults to `NULL`
until a phase populates it) and avoids that.

## Fields (present on `DocumentClause`, `Entity`, `Relation`, `Risk`, `Obligation`)

| Field          | Type    | Populated by                                   |
| -------------- | ------- | ----------------------------------------------- |
| `text_start`    | `Int?`   | Canonical-text extraction + NER/clause/risk/relation phases |
| `text_end`      | `Int?`   | same                                             |
| `page_number`   | `Int?`   | A future PDF layout-extraction phase             |
| `bbox_x`        | `Float?` | same                                             |
| `bbox_y`        | `Float?` | same                                             |
| `bbox_width`    | `Float?` | same                                             |
| `bbox_height`   | `Float?` | same                                             |
| `confidence`    | `Float?` | Whichever model produced the fact                |
| `model_name`    | `String?`| same                                             |
| `model_version` | `String?`| same                                             |

`Relation` does not carry its own text span in this schema (a relation
connects two `Entity` rows, each of which already carries provenance);
it still carries `confidence`/`model_name`/`model_version` since the
relation itself is a model-produced fact independent of its endpoints.
