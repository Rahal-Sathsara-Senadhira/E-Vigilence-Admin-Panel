// A local single-node MongoDB replica set for development, without Docker
// (docs/17 §8, D17-6). Data is kept in apps/api/.data/mongo between runs.
//
//   pnpm db:local      → mongodb://127.0.0.1:27027/evigilance?replicaSet=ev-local
//
// Set MONGOMS_SYSTEM_BINARY to use an installed mongod instead of the
// downloaded one.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = 27027;
const dbPath = resolve(".data/mongo");
mkdirSync(dbPath, { recursive: true });

async function main() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: "ev-local", count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, dbPath }],
  });

  console.log(
    `MongoDB replica set running: mongodb://127.0.0.1:${PORT}/evigilance?replicaSet=ev-local`,
  );
  console.log(`Data folder: ${dbPath}`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await replSet.stop({ doCleanup: false, force: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
