import compression from "compression";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./routes/auth.routes.js";
import { docsRouter } from "./routes/docs.routes.js";
import { systemRouter } from "./routes/system.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { verificationRouter } from "./routes/verification.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(compression());
  app.use(docsRouter);
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  app.use(systemRouter);
  app.use(authRouter);
  app.use(userRouter);
  app.use(verificationRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
