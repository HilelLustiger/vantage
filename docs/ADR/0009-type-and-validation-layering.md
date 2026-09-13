# 0009: Type & validation layering

## Status

Accepted — 2026-09-13

## Context

`backend` uses TypeScript types (`dto/`), Zod schemas (input validation),
and Drizzle's inferred row types (`db/schema.ts`) side by side, but with no
consistent rule for which one is the source of truth for a given shape.
Zod schemas were being hand-written inline inside individual controllers
(`controllers/assets.ts`, `controllers/accounts.ts`, ...), each duplicating
a shape the DTO already declared by hand a few lines away — two
hand-maintained definitions of "what does creating an Asset look like" that
could silently drift from each other. Meanwhile `repositories/` already had
the right instinct in one place (`typeof assets.$inferSelect` instead of a
hand-written row interface) without that instinct being written down as a
rule everywhere else.

TypeScript was chosen specifically because it lets us define types; that
should be used everywhere a shape exists. Zod was chosen specifically for
runtime validation; that should be applied uniformly at every boundary
where untrusted data enters the system, not ad hoc per controller.

## Decision

Three layers, one rule each — **never hand-duplicate a shape that a schema
elsewhere already defines**:

**1. DB row shape** — derived from `db/schema.ts` via Drizzle's
`$inferSelect`/`$inferInsert`, and given a name right there next to the
table it belongs to (e.g. `export type AssetRow = typeof assets.$inferSelect;`).
`repositories/*.ts` reference that name — never a hand-written parallel
interface, and never the bare `typeof table.$inferSelect` inlined at the
call site (the same reasoning as layer 2's named `z.infer` alias: a shape
worth deriving is worth naming once, not re-spelled out at every use).
Used only inside `repositories/`; never crosses that boundary.

**2. Wire input shape** (anything a controller reads from `req.body` or
`req.query`) — a Zod schema is the single source of truth, defined once in
`dto/<domain>.ts`, colocated with the DTOs for that domain. The TypeScript
type is `z.infer<typeof theSchema>` — never a separately hand-written
interface. Controllers import the schema from `dto/` and call
`.safeParse()`; they never define a schema inline.

**3. Wire output shape** (what `repositories`/`services` construct and a
controller sends back) — a plain hand-written TypeScript interface in
`dto/`, as today. No Zod involved — we don't runtime-validate our own
trusted output; the compiler already guarantees a repository returns the
shape its callers expect.

Example (`dto/assets.ts`):

```ts
export const NewAssetInputSchema = z.object({
  type: z.enum(["stock", "etf", "mutual_fund", "bond", "cash"]),
  name: z.string().min(1),
  ticker: z.string().min(1).optional(),
  isin: z.string().min(1).optional(),
  securityNumber: z.string().min(1).optional(),
});
export type NewAssetInput = z.infer<typeof NewAssetInputSchema>;

// Output — plain interface, no Zod.
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  ticker?: string;
  isin?: string;
  securityNumber?: string;
}
```

`controllers/assets.ts` then does `NewAssetInputSchema.safeParse(req.body)`
— no locally-defined schema.

## Alternatives Considered

- **Keep hand-writing a TS interface and a matching Zod schema per input
  shape** (status quo) — rejected: two hand-maintained definitions of the
  same shape drift silently; nothing forces them to stay in sync, and
  nothing catches it when they don't.
- **Derive Zod schemas from the TS interfaces instead** (`Asset` first,
  generate a schema from it) — rejected: TypeScript types are erased at
  compile time, so there's nothing to derive a runtime schema _from_ — it
  would still mean hand-writing the schema separately, just in the other
  order.
- **Validate output shapes with Zod too, for uniformity** — rejected: there
  is no untrusted boundary on the way out — a controller is sending data
  `repositories`/`services` already constructed under the compiler's
  supervision. Adding runtime validation there is ceremony without a safety
  payoff, and blurs the actual distinction this ADR is drawing (validation
  belongs at the boundary where untrusted data enters).

## Consequences

- Every input shape's Zod schema now lives in the same file as its sibling
  DTOs, discoverable the same way — not scattered across
  `controllers/*.ts`.
- Adding or changing an input field means editing exactly one schema; the
  TS type follows automatically via `z.infer`.
- `repositories/*.ts` functions that map a DB row to a DTO take the table's
  named `*Row` type (e.g. `AssetRow`, `AccountRow`) as their parameter type
  — defined once in `db/schema.ts`, never a hand-written row interface and
  never an inline `typeof table.$inferSelect`.
- Existing inline schemas in `controllers/accounts.ts`, `controllers/assets.ts`,
  and any others written before this ADR need to move into `dto/` and be
  re-derived — tracked as follow-up implementation work, not retroactively
  rewritten by this ADR itself.

## Related

- `backend/src/dto/` — the wire contract this ADR governs the internals of
- 0004 — Domain model core
