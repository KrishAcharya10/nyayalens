import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;

// Scanned pages need a higher resolution than pdfjs-dist's default 1x
// scale for Tesseract to read reliably - 2x approximates ~150dpi for a
// typical A4/Letter page.
const RENDER_SCALE = 2;

// Renders one PDF page to a PNG buffer, for OCR input. pdfjs-dist's
// render() needs a canvas-like 2D context; @napi-rs/canvas provides one
// without requiring native build tools on the host (unlike `canvas`,
// which needs a C++ toolchain).
export async function rasterizePdfPage(data: Buffer, pageNumber: number): Promise<Buffer> {
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    // @napi-rs/canvas's context is API-compatible with the 2D context
    // subset pdfjs-dist actually uses, but isn't the DOM type pdfjs's own
    // types declare (this project's tsconfig has no "DOM" lib, by design -
    // this is server code). Cast through the parameter type itself rather
    // than naming the DOM type directly.
    type RenderParams = Parameters<typeof page.render>[0];
    await page.render({
      canvasContext: context as unknown as RenderParams["canvasContext"],
      viewport,
    }).promise;

    return canvas.toBuffer("image/png");
  } finally {
    await pdf.destroy();
  }
}
