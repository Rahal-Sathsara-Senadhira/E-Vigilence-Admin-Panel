// Mobile-app import (docs/11 §8): runs every APP_IMPORT_INTERVAL_SECONDS.
// Started by the server, never by tests (they call `run()` directly).

import { every } from "#src/core/jobs.js";
import { createAppImport } from "./app-import.service.js";

export { createAppImport };

/**
 * @param {Parameters<typeof createAppImport>[0] & { intervalSeconds: number }} deps
 * @returns {{ stop: () => Promise<void> }}
 */
export function startAppImport({ intervalSeconds, ...deps }) {
  const job = createAppImport(deps);
  return every({
    name: "Mobile-app import",
    seconds: intervalSeconds,
    logger: deps.logger,
    // Logged only when something happened.
    work: async () => {
      const r = await job.run();
      return r.imported || r.refused || r.replies || r.failed ? r : null;
    },
  });
}
