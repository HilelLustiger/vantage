import { Router, type Request, type Response } from "express";
import type { AuthedUser, ErrorResponse } from "../dto/index.js";
import { LoginInputSchema } from "../dto/identity.js";
import { findUserById, findUserCredentialsByEmail } from "../repositories/users.js";
import { verifyPassword } from "./password.js";
import { requireAuth } from "./requireAuth.js";

export const authRouter = Router();

authRouter.post("/login", async (req: Request, res: Response<AuthedUser | ErrorResponse>) => {
  const parsed = LoginInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: ErrorResponse = { error: "invalid request" };
    res.status(400).json(response);
    return;
  }

  const { email, password } = parsed.data;
  const credentials = await findUserCredentialsByEmail(email);
  if (!credentials || !(await verifyPassword(password, credentials.passwordHash))) {
    const response: ErrorResponse = { error: "invalid credentials" };
    res.status(401).json(response);
    return;
  }

  req.session.regenerate((err) => {
    if (err) {
      const response: ErrorResponse = { error: "session error" };
      res.status(500).json(response);
      return;
    }
    req.session.userId = credentials.id;
    const response: AuthedUser = { id: credentials.id, email: credentials.email };
    res.status(200).json(response);
  });
});

authRouter.post("/logout", (req: Request, res: Response<ErrorResponse>) => {
  req.session.destroy((err) => {
    if (err) {
      const response: ErrorResponse = { error: "session error" };
      res.status(500).json(response);
      return;
    }
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

authRouter.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response<AuthedUser | ErrorResponse>) => {
    const user = await findUserById(req.session.userId!);
    if (!user) {
      const response: ErrorResponse = { error: "unauthorized" };
      res.status(401).json(response);
      return;
    }
    const response: AuthedUser = { id: user.id, email: user.email };
    res.status(200).json(response);
  },
);
