import { SYSTEM_PATHS } from "@verilot/contracts";
import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "../openapi/document.js";

export const docsRouter = Router();

docsRouter.get(SYSTEM_PATHS.openApi, helmet(), (_request, response) => {
  response.status(200).json(openApiDocument);
});

const docsHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      connectSrc: ["'self'"],
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
});

docsRouter.use(
  SYSTEM_PATHS.docs,
  docsHeaders,
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "VeriLot API",
  }),
);
