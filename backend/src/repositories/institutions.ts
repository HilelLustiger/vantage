import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { institutions, type InstitutionRow } from "../db/schema.js";

export async function listInstitutions(): Promise<InstitutionRow[]> {
  return db.select().from(institutions);
}

export async function findInstitutionById(id: string): Promise<InstitutionRow | undefined> {
  const [institution] = await db.select().from(institutions).where(eq(institutions.id, id));
  return institution;
}

export async function createInstitution(name: string): Promise<InstitutionRow> {
  const [institution] = await db.insert(institutions).values({ name }).returning();
  return institution;
}
