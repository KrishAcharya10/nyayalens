import path from "node:path";
import { createWorker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

// tesseract.js caches the downloaded language data (eng.traineddata,
// ~5MB) here instead of its default of the process's cwd, which would
// otherwise litter apps/api/ with a binary file. Git-ignored (see
// .gitignore) - re-downloaded on first OCR run in a fresh clone.
const OCR_CACHE_PATH = path.resolve(process.cwd(), ".tesseract-cache");

let workerPromise: ReturnType<typeof createWorker> | null = null;

// One shared worker (Tesseract's own recommendation - creating a worker
// per page downloads/initializes the language model repeatedly).
async function getWorker() {
  workerPromise ??= createWorker("eng", undefined, { cachePath: OCR_CACHE_PATH });
  return workerPromise;
}

export async function runOcrOnImage(imageBuffer: Buffer): Promise<OcrResult> {
  const worker = await getWorker();
  const {
    data: { text, confidence },
  } = await worker.recognize(imageBuffer);
  return { text: text.trim(), confidence: confidence / 100 };
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
