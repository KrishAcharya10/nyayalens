"""
Phase 4B: fine-tunes InLegalBERT (law-ai/InLegalBERT) for token
classification (NER) on the synthetic dataset - the actual research
deliverable this project's fine-tuned model_source is built from.

COMPUTE-CONSTRAINED CONFIGURATION - read before trusting these numbers:
this environment has no GPU, and InLegalBERT is a BERT-base-sized model
(~110M parameters). MAX_LENGTH/BATCH_SIZE/EPOCHS below are sized to
finish in bounded wall-clock time on CPU, not tuned for best achievable
accuracy. This is a real, reportable limitation - see
docs/architecture/evaluation_results.md for the actual training time
observed and what a properly-resourced run would need to change.

EPOCHS was reduced from 2 to 1 after a single-fold timing smoke test (2
epochs, ~240 training documents, batch_size=8, max_length=384) ran for
over 40 minutes of wall-clock time on this sandbox's CPU without
finishing - training 5 separate fold models at 2 epochs each was judged
impractical within this session. 1 epoch per fold is a further,
deliberate accuracy/time trade-off, not a hidden one - see
evaluation_results.md for the actual per-fold training time this
produced and what it implies about the reported metrics' ceiling.

Every fold (see evaluate.py) trains a completely separate model from the
InLegalBERT checkpoint - there is no cross-fold weight sharing, which is
what makes the resulting cross-validation honest (a model that saw fold
3's test documents during fold 3's training would leak).
"""

import numpy as np
import torch
from bio_encoding import build_label_list, decode_predictions, encode_tags
from dataset import GroundTruthDocument, entity_label_vocabulary
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODEL_NAME = "law-ai/InLegalBERT"
MAX_LENGTH = 384
BATCH_SIZE = 8
EPOCHS = 1
LEARNING_RATE = 3e-5


class NERDataset(torch.utils.data.Dataset):
    def __init__(self, encodings: dict):
        self.encodings = encodings

    def __len__(self) -> int:
        return len(self.encodings["input_ids"])

    def __getitem__(self, idx: int) -> dict:
        return {key: torch.tensor(value[idx]) for key, value in self.encodings.items()}


def build_label_mappings(all_documents: list[GroundTruthDocument]) -> tuple[list[str], dict, dict]:
    label_list = build_label_list(entity_label_vocabulary(all_documents))
    label2id = {label: i for i, label in enumerate(label_list)}
    id2label = dict(enumerate(label_list))
    return label_list, label2id, id2label


def _encode_documents(tokenizer, documents: list[GroundTruthDocument], label2id: dict) -> dict:
    encodings = tokenizer(
        [d.text for d in documents],
        truncation=True,
        max_length=MAX_LENGTH,
        padding="max_length",
        return_offsets_mapping=True,
    )
    all_label_ids = []
    for i, doc in enumerate(documents):
        tags = encode_tags(doc, encodings["offset_mapping"][i])
        all_label_ids.append([label2id[t] if t is not None else -100 for t in tags])
    encodings["labels"] = all_label_ids
    del encodings["offset_mapping"]
    return encodings


def train_fold(
    train_documents: list[GroundTruthDocument],
    label_list: list[str],
    label2id: dict,
    id2label: dict,
    log=print,
) -> tuple[AutoTokenizer, AutoModelForTokenClassification]:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME, num_labels=len(label_list), id2label=id2label, label2id=label2id
    )

    encodings = _encode_documents(tokenizer, train_documents, label2id)
    dataset = NERDataset(encodings)
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)

    model.train()
    for epoch in range(EPOCHS):
        epoch_losses = []
        for batch in loader:
            optimizer.zero_grad()
            outputs = model(**batch)
            outputs.loss.backward()
            optimizer.step()
            epoch_losses.append(outputs.loss.item())
        log(f"    epoch {epoch + 1}/{EPOCHS}: mean loss = {np.mean(epoch_losses):.4f}")

    model.eval()
    return tokenizer, model


def predict_entities(tokenizer, model, id2label: dict, text: str) -> list[dict]:
    if not text.strip():
        return []

    encoding = tokenizer(
        text,
        truncation=True,
        max_length=MAX_LENGTH,
        return_offsets_mapping=True,
        return_tensors="pt",
    )
    offset_mapping = encoding.pop("offset_mapping")[0].tolist()

    with torch.no_grad():
        outputs = model(**encoding)
    predicted_ids = outputs.logits.argmax(dim=-1)[0].tolist()
    predicted_labels = [id2label[i] for i in predicted_ids]

    return decode_predictions(text, offset_mapping, predicted_labels)


if __name__ == "__main__":
    # Standalone smoke test: one fine-tuning run on a simple grouped 80/20
    # split (not the full 5-fold evaluation - that's evaluate.py) to prove
    # the fine-tuning mechanics work end-to-end and report basic timing.
    import time

    from dataset import load_synthetic_documents
    from kfold import make_folds

    documents = load_synthetic_documents()
    label_list, label2id, id2label = build_label_mappings(documents)
    print(f"[finetune] {len(documents)} documents, {len(label_list)} BIO labels")

    fold = make_folds(documents, n_splits=5)[0]
    train_docs = [d for d in documents if d.doc_id in fold["train_doc_ids"]]
    test_docs = [d for d in documents if d.doc_id in fold["test_doc_ids"]]
    print(f"[finetune] Smoke-test fold: {len(train_docs)} train, {len(test_docs)} test")

    started = time.time()
    tokenizer, model = train_fold(train_docs, label_list, label2id, id2label)
    print(f"[finetune] Training took {time.time() - started:.1f}s")

    sample = test_docs[0]
    predicted = predict_entities(tokenizer, model, id2label, sample.text)
    print(f"[finetune] Sample prediction on {sample.doc_id}: {predicted}")
