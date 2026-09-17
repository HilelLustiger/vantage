import express from "express";
import { sessionMiddleware } from "./infra/session.js";
import { authRouter } from "./controllers/auth.js";
import { institutionsRouter } from "./controllers/institutions.js";
import { assetsRouter } from "./controllers/assets.js";
import { accountsRouter } from "./controllers/accounts.js";
import { usersRouter } from "./controllers/users.js";
import { holdingsRouter } from "./controllers/holdings.js";
import { documentsRouter } from "./controllers/documents.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(sessionMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/institutions", institutionsRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/holdings", holdingsRouter);
  app.use("/api/documents", documentsRouter);

  return app;
}
