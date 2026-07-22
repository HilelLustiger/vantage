import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { institutions } from "./schema.js";

export async function createInstitution(input: { name: string }) {
  const [institution] = await db.insert(institutions).values(input).returning();
  return institution;
}

export async function findInstitutionById(id: string) {
  const [institution] = await db
    .select()
    .from(institutions)
    .where(eq(institutions.id, id));
  return institution;
}

export async function listInstitutions() {
  return db.select().from(institutions);
}
