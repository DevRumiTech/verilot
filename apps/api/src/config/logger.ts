import pino from "pino";

import { env } from "./env.js";

export const logger = pino({
  base: {
    service: "verilot-api",
  },
  level: env.LOG_LEVEL,
  redact: {
    censor: "[REDACTED]",
    paths: [
      "request.headers.authorization",
      "request.headers.cookie",
      "response.headers.set-cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
  },
});
