import { Router } from "express";
import { z } from "zod";
import type { User } from "../dto/index.js";
import { findUserByEmail, findUserById } from "../shared/db/users.js";
import { verifyPassword } from "./password.js";
import { requireAuth } from "./requireAuth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "session error" });
      return;
    }
    req.session.userId = user.id;
    res.status(200).json({ id: user.id, email: user.email } satisfies Pick<User, "id" | "email">);
  });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "session error" });
      return;
    }
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.status(200).json({ id: user.id, email: user.email });
});
