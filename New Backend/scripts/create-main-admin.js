// Creates the main administrator account at go-live — docs/21 §4.4.
//
//   npm run create-main-admin -- --name "Full Name" --email it.head@police.lk [--service-number IT1001]
//
// - Refuses to run if any system administrator already exists.
// - Prints a temporary password ONCE. The custodian signs in, chooses their
//   own password and sets up two-step sign-in; the temporary one then stops
//   working.
// - Run on the server with two officers present (docs/21 §4.4).

import { parseArgs } from "node:util";
import { z } from "zod";
import { loadEnv } from "#src/config/env.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { hashPassword } from "#src/core/auth/passwords.js";
import { temporaryPassword } from "#src/core/auth/temporary-password.js";
import { connectDatabase, disconnectDatabase, inTransaction } from "#src/core/db/connection.js";
import { User } from "#src/modules/users/user.model.js";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    "service-number": { type: "string" },
  },
});

const input = z
  .object({
    name: z.string().trim().min(3, "--name is required (the custodian's full name)."),
    email: z.string().trim().toLowerCase().email("--email must be a valid email address."),
    serviceNumber: z.string().trim().optional(),
  })
  .safeParse({ name: values.name, email: values.email, serviceNumber: values["service-number"] });
if (!input.success) {
  for (const issue of input.error.issues) console.error(`  ${issue.message}`);
  process.exit(1);
}

const env = loadEnv();
await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });
await User.syncIndexes();

try {
  if (await User.exists({ role: "system_admin" })) {
    console.error(
      "A system administrator already exists. Nothing was created.\n" +
        "Use an existing system administrator to create or reset administrator accounts (docs/21 §4.3).",
    );
    process.exitCode = 1;
  } else {
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    await inTransaction(async (session) => {
      const [user] = await User.create(
        [
          {
            name: input.data.name,
            email: input.data.email,
            serviceNumber: input.data.serviceNumber ?? null,
            role: "system_admin",
            passwordHash,
            mustChangePassword: true,
          },
        ],
        { session },
      );
      const u = /** @type {NonNullable<typeof user>} */ (user);
      await recordAudit(
        {
          actor: { kind: "system", name: "Go-live set-up command" },
          action: "users.main_admin_created",
          summary: `Main administrator account created for ${u.name}`,
          target: { type: "user", id: String(u._id), label: u.email ?? u.name },
        },
        session,
      );
    });
    console.log(`
Main administrator account created for ${input.data.name} <${input.data.email}>.

  Temporary password:  ${password}

Give it to the custodian in person. At the first sign-in they choose their own
password and set up two-step sign-in; this temporary password then stops working.
It is not stored anywhere and won't be shown again.
`);
  }
} finally {
  await disconnectDatabase();
}
