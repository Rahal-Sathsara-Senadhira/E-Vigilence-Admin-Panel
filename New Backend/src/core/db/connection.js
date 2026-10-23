// MongoDB connection and transactions (docs/19 §4.2 rule 4).

import mongoose from "mongoose";

mongoose.set("strictQuery", true);

/**
 * @param {{ uri: string, dbName: string }} options
 */
export async function connectDatabase({ uri, dbName }) {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/**
 * Runs `work` in a transaction: every write inside commits together or not
 * at all. Mongoose retries on transient errors, so `work` must be safe to
 * run again.
 * @template T
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function inTransaction(work) {
  /** @type {T | undefined} */
  let result;
  await mongoose.connection.transaction(async (session) => {
    result = await work(session);
  });
  return /** @type {T} */ (result);
}
