import { randomUUID } from "node:crypto";

import { pinoHttp } from "pino-http";

import { logger } from "../config/logger.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

function generateRequestId(): string {
  return `req_${randomUUID().replaceAll("-", "")}`;
}

export const requestContext = pinoHttp({
  customErrorMessage: () => "request failed",
  customProps: (request) => ({
    requestId: request.id,
  }),
  customSuccessMessage: () => "request completed",
  genReqId: (request, response) => {
    const receivedRequestId = request.headers["x-request-id"];
    const requestId =
      typeof receivedRequestId === "string" && REQUEST_ID_PATTERN.test(receivedRequestId)
        ? receivedRequestId
        : generateRequestId();

    response.setHeader("X-Request-ID", requestId);

    return requestId;
  },
  logger,
});
