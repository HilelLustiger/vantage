import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../api/password.js";

describe("password hashing", () => {
  it("round-trips: a hashed password verifies against its original", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
