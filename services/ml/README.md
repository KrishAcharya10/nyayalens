# services/ml

Python component of the extraction pipeline. Everything else (Node/TS) is
in `apps/api`; this exists only because Phase 4A's generic-transformer NER
baseline and Phase 4B's InLegalBERT fine-tuning need PyTorch/HuggingFace
Transformers, which have no equivalent maturity in the Node ecosystem.

## Setup

```powershell
cd services/ml
python -m venv .venv
.venv\Scripts\pip.exe install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
```

The `--index-url`/`--extra-index-url` pair pulls the CPU-only PyTorch
build (much smaller than the default CUDA build, and this project has no
GPU dependency) while still resolving everything else from PyPI.

Then set `ML_SERVICE_PYTHON` in the repo root `.env` to the venv's
`python.exe` path (see `.env.example`). Left empty, `apps/api`'s
extraction pipeline skips the generic-transformer NER stage (recorded as
a `FAILED` `ProcessingJob` with a clear reason) but every other stage
still runs.

**Why it's opt-in, not on by default**: every invocation of
`baseline_ner.py` is a fresh Python process that reloads PyTorch and the
model from disk (a few seconds to tens of seconds). Uploading a document
without `ML_SERVICE_PYTHON` set stays fast; with it set, each upload pays
that cost. There's no in-process model server here (yet) - see
`docs/architecture/extraction_pipeline.md` for why that's a documented,
deliberate scope cut for this phase.

## Files

- `baseline_ner.py` - Phase 4A's generic-transformer NER baseline
  (`model_source: generic_transformer`). Stateless stdin/stdout JSON, no
  database access - see its docstring.
- `requirements.txt` - pinned dependencies (transformers, torch-cpu,
  scikit-learn, psycopg2-binary, python-dotenv).
- Phase 4B adds `finetune_ner.py` and `evaluate.py` here - see
  `docs/architecture/extraction_pipeline.md` and
  `docs/architecture/evaluation_results.md`.

## Linting

Covered by the repo-root `pyproject.toml` Ruff config (`python -m ruff
check services/ml`), same as `research/generator/`.
