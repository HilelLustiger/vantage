import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../dto/index.js";

export function requireAuth(req: Request, res: Response<ErrorResponse>, next: NextFunction) {
  if (!req.session.userId) {
    const error: ErrorResponse = { error: "unauthorized" };
    res.status(401).json(error);
    return;
  }
  next();
}
