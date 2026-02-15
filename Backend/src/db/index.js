import { DB_PROVIDER } from "../config/env.js";
import mongoProvider from "./providers/mongo/index.js";

const providers = {
  mongo: mongoProvider,
};

function getProvider() {
  const provider = providers[DB_PROVIDER];
  if (!provider) {
    throw new Error(`Invalid DB_PROVIDER "${DB_PROVIDER}". Valid: ${Object.keys(providers).join(", ")}`);
  }
  return provider;
}

const db = {
  connect: async () => getProvider().connect(),
  disconnect: async () => getProvider().disconnect(),
  getClient: () => getProvider().getClient(),
  getProviderName: () => DB_PROVIDER,
};

export default db;
