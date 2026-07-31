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
      "request.headers['x-csrf-token']",
      "response.headers.set-cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-csrf-token']",
      "res.headers.set-cookie",
    ],
  },
});
