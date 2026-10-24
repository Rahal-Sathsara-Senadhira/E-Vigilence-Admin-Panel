// Background jobs: run `work` now and then every `seconds`, one run at a
// time. A failed run is logged and the next one goes ahead. Started by the
// server only — tests call the work directly.

/**
 * @param {{ name: string, seconds: number, logger: import("pino").Logger,
 *   work: () => Promise<unknown> }} job
 * @returns {{ stop: () => Promise<void> }}
 */
export function every({ name, seconds, logger, work }) {
  if (seconds <= 0) {
    logger.info(`${name}: off`);
    return { stop: async () => {} };
  }
  /** @type {Promise<void> | null} */
  let running = null;
  const tick = () => {
    running ??= (async () => {
      try {
        const result = await work();
        if (result) logger.info({ result }, name);
      } catch (err) {
        logger.error({ err }, `${name} failed`);
      } finally {
        running = null;
      }
    })();
  };
  const timer = setInterval(tick, seconds * 1000);
  timer.unref();
  tick();
  return {
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
