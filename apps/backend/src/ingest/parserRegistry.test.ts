import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccountWithOwners } from "../shared/db/accounts.js";
import { insertDocument } from "../shared/db/documents.js";
import { createInstitution } from "../shared/db/institutions.js";
import { createUser } from "../shared/db/users.js";
import { resolveParserKey } from "./parserRegistry.js";

describe("resolveParserKey", () => {
  it("resolves the document's institution name and format", async () => {
    const user = await createUser({
      email: `test-${randomUUID()}@example.com`,
      passwordHash: "not-checked-in-these-tests",
    });
    const institutionName = `Bank ${randomUUID()}`;
    const institution = await createInstitution({ name: institutionName });
    const account = await createAccountWithOwners({
      institutionId: institution.id,
      name: "Test Account",
      ownerUserIds: [user.id],
    });
    const document = await insertDocument({ accountId: account.id, checksum: randomUUID() });

    await expect(resolveParserKey(document)).resolves.toEqual({
      institution: institutionName,
      format: "pdf",
    });
  });
});
