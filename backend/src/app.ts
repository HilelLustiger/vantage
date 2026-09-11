import express from "express";
import { sessionMiddleware } from "./infra/session.js";
import { authRouter } from "./routes/auth.js";
import { institutionsRouter } from "./routes/institutions.js";
import { accountsRouter } from "./routes/accounts.js";
import { assetsRouter } from "./routes/assets.js";
import { documentsRouter } from "./routes/documents.js";
import { snapshotsRouter } from "./routes/snapshots.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(sessionMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/institutions", institutionsRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/snapshots", snapshotsRouter);
  app.use("/api/portfolio", portfolioRouter);
  app.use("/api/users", usersRouter);

  return app;
}
