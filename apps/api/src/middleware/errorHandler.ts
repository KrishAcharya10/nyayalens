import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";

// Client mistakes are answered as such (4xx with a useful message) and are
// not logged as server errors; anything else is a 500 with a generic body, so
// internals are never leaked to the caller.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File is too large" });
    } else {
      res.status(400).json({ error: "Invalid upload" });
    }
    return;
  }
  // body-parser: malformed JSON, or a body over the size limit.
  const status = typeof err === "object" && err !== null && "status" in err ? err.status : null;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const type = (err as { type?: unknown }).type;
    res.status(status).json({
      error: type === "entity.too.large" ? "Request body is too large" : "Malformed request",
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
