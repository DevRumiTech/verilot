import pino, { type DestinationStream, type LoggerOptions } from "pino";

import { env } from "./env.js";

const loggerOptions: LoggerOptions = {
  base: {
    service: "verilot-api",
  },
  level: env.LOG_LEVEL,
  redact: {
    censor: "[REDACTED]",
    paths: [
      "request.headers.authorization",
      "request.headers.cookie",
      "request.headers['x-api-key']",
      "request.headers['x-csrf-token']",
      "response.headers.set-cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.headers['x-csrf-token']",
      "res.headers.set-cookie",
    ],
  },
};

export function createLogger(destination?: DestinationStream) {
  return destination === undefined ? pino(loggerOptions) : pino(loggerOptions, destination);
}

export const logger = createLogger();
