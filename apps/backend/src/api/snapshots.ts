import { Router } from "express";
import type { Holding, Snapshot } from "@vantage/shared-types";
import { listHoldingsForSnapshot } from "../shared/db/holdings.js";
import { findSnapshotVisibleToUser, listSnapshotsForUser } from "../shared/db/snapshots.js";
import { requireAuth } from "./requireAuth.js";

// Read-only — Snapshots/Holdings are only ever created by the ingest
// pipeline (#21), never directly via this API.
export const snapshotsRouter = Router();

snapshotsRouter.use(requireAuth);

snapshotsRouter.get("/", async (req, res) => {
  const includeSuperseded = req.query.includeSuperseded === "true";
  res
    .status(200)
    .json(
      (await listSnapshotsForUser(req.session.userId!, {
        includeSuperseded,
      })) satisfies Snapshot[],
    );
});

snapshotsRouter.get("/:id", async (req, res) => {
  const snapshot = await findSnapshotVisibleToUser(req.params.id, req.session.userId!);
  if (!snapshot) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json(snapshot satisfies Snapshot);
});

snapshotsRouter.get("/:id/holdings", async (req, res) => {
  const snapshot = await findSnapshotVisibleToUser(req.params.id, req.session.userId!);
  if (!snapshot) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json((await listHoldingsForSnapshot(snapshot.id)) satisfies Holding[]);
});
