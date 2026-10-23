// JSON logs (docs/19 §3). Secrets and tokens are removed before writing.

import { pino } from "pino";

/** @param {{ level: string }} options */
export function createLogger({ level }) {
  return pino({
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "*.password",
        "*.newPassword",
        "*.code",
      ],
      censor: "[hidden]",
    },
  });
}

/** @typedef {ReturnType<typeof createLogger>} Logger */
