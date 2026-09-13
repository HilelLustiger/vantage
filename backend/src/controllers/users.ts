import { Router, type Request, type Response } from "express";
import type { HouseholdUser } from "../dto/index.js";
import { listUsers } from "../repositories/users.js";
import { requireAuth } from "./requireAuth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", async (_req: Request, res: Response<HouseholdUser[]>) => {
  const response: HouseholdUser[] = await listUsers();
  res.status(200).json(response);
});
