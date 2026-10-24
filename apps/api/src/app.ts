import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { compareRouter } from "./routes/compare.js";
import { documentsRouter } from "./routes/documents.js";
import { domainPacksRouter } from "./routes/domainPacks.js";
import { semanticsRouter } from "./routes/semantics.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";

function allowedOrigins(): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  // Only the configured web origins may call the API from a browser
  // (CORS_ORIGINS); the default allows the local Next.js app.
  app.use(cors({ origin: allowedOrigins() }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.use("/documents", semanticsRouter);
  app.use("/documents", documentsRouter);
  app.use("/domain-packs", domainPacksRouter);
  app.use("/compare", compareRouter);

  app.use(errorHandler);

  return app;
}
