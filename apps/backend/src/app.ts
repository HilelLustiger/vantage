import express from "express";
import { sessionMiddleware } from "./shared/session.js";
import { authRouter } from "./api/auth.js";
import { institutionsRouter } from "./api/institutions.js";
import { accountsRouter } from "./api/accounts.js";
import { assetsRouter } from "./api/assets.js";

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

  return app;
}
