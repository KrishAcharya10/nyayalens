"""
One-time model pre-fetch for fully offline operation.

Downloads every Hugging Face model NyayaLens uses into the local cache
(~/.cache/huggingface, or $HF_HOME). After this has run once, the API
spawns baseline_ner.py with HF_HUB_OFFLINE=1 (see
apps/api/src/ner/genericTransformerNer.ts) and nothing reaches the network.

    services/ml/.venv/Scripts/python.exe services/ml/download_models.py
"""

import os

# This script's whole job is to download, so make sure an offline flag
# inherited from the shell doesn't silently turn it into a no-op.
os.environ["HF_HUB_OFFLINE"] = "0"
os.environ["TRANSFORMERS_OFFLINE"] = "0"

from huggingface_hub import snapshot_download  # noqa: E402

from baseline_ner import MODEL_NAME as BASELINE_MODEL  # noqa: E402
from finetune_ner import MODEL_NAME as FINETUNE_BASE_MODEL  # noqa: E402

MODELS = [BASELINE_MODEL, FINETUNE_BASE_MODEL]


def main() -> None:
    for repo_id in MODELS:
        path = snapshot_download(repo_id, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin", "*.model"])
        print(f"{repo_id} -> {path}")
    print("All models cached - the API can now run with HF_HUB_OFFLINE=1.")


if __name__ == "__main__":
    main()
