import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, "api listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "api shutdown requested");

    server.close((error) => {
      if (error) {
        logger.error({ error }, "api shutdown failed");
        process.exitCode = 1;
        return;
      }

      logger.info("api shutdown complete");
    });
  });
}
