// Starts one in-memory MongoDB replica set for the whole test run
// (transactions need a replica set). Tests never touch Atlas.

import { MongoMemoryReplSet } from "mongodb-memory-server";

/** @param {import("vitest/node").TestProject} project */
export default async function setup(project) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  project.provide("mongoUri", replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}
