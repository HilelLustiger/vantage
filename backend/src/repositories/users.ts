import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

// The only way a User is ever created — no signup endpoint exists. See ADR 0019.
export async function createUser(input: { email: string; passwordHash: string }) {
  const [user] = await db.insert(users).values(input).returning();
  return user;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// The household's members, for the "Add account" owners picker — id/email
// only, never passwordHash.
export async function listUsers() {
  return db.select({ id: users.id, email: users.email }).from(users);
}

// Carries passwordHash, unlike findUserById — auth's login check is the
// only caller that should ever see it.
export async function findUserCredentialsByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}
