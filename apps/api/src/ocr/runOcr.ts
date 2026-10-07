import { createRequire } from "node:module";
import path from "node:path";
import { createWorker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

// tesseract.js caches the language data (eng.traineddata, ~5MB) here
// instead of its default of the process's cwd, which would otherwise
// litter apps/api/ with a binary file. Git-ignored (see .gitignore).
const OCR_CACHE_PATH = path.resolve(process.cwd(), ".tesseract-cache");

// Language data is read from the @tesseract.js-data/eng npm package
// rather than tesseract.js's default jsDelivr CDN URL, so OCR works fully
// offline. 4.0.0_best_int is the same model build the CDN default serves,
// so OCR output is unchanged by this.
const require = createRequire(import.meta.url);
const OCR_LANG_PATH = path.join(
  path.dirname(require.resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0_best_int",
);

let workerPromise: ReturnType<typeof createWorker> | null = null;

// One shared worker (Tesseract's own recommendation - creating a worker
// per page downloads/initializes the language model repeatedly).
async function getWorker() {
  workerPromise ??= createWorker("eng", undefined, {
    cachePath: OCR_CACHE_PATH,
    langPath: OCR_LANG_PATH,
    gzip: true,
  });
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
