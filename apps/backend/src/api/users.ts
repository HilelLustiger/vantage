import { Router } from "express";
import type { User } from "@vantage/shared-types";
import { listUsers } from "../shared/db/users.js";
import { requireAuth } from "./requireAuth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// id + email only — listUsers() never selects passwordHash. Used to pick
// joint owners when creating an Account (#8); no self-signup (ADR-0017),
// so this is just enumerating the household's existing Users.
usersRouter.get("/", async (_req, res) => {
  res.status(200).json((await listUsers()) satisfies Pick<User, "id" | "email">[]);
});
