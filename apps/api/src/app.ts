import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { domainPacksRouter } from "./routes/domainPacks.js";
import { semanticsRouter } from "./routes/semantics.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.use("/documents", semanticsRouter);
  app.use("/documents", documentsRouter);
  app.use("/domain-packs", domainPacksRouter);

  app.use(errorHandler);

  return app;
}
