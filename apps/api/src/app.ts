import compression from "compression";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { systemRouter } from "./routes/system.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));

  app.use(systemRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
