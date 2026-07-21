import express from "express";
import { sessionMiddleware } from "./shared/session.js";
import { authRouter } from "./api/auth/router.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(sessionMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  return app;
}
