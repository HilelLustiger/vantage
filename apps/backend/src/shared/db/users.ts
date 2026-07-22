import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { users } from "./schema.js";

export async function createUser(input: {
  email: string;
  passwordHash: string;
}) {
  const [user] = await db.insert(users).values(input).returning();
  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  return user;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function listUsers() {
  return db.select({ id: users.id, email: users.email }).from(users);
}
