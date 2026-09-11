import "dotenv/config";
import { parseArgs } from "node:util";
import { hashPassword } from "../api/password.js";
import { createUser } from "../db/users.js";
import { pool } from "../db/client.js";

// The only way a User is ever created — no signup endpoint exists. See ADR 0019.
async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
    },
  });

  if (!values.email || !values.password) {
    console.error(
      "usage: npm run create-user --workspace=backend -- --email <email> --password <password>",
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(values.password);
  const user = await createUser({ email: values.email, passwordHash });
  console.log(`created user ${user.id} (${user.email})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
