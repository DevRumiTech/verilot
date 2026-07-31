import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors/api-error.js";

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const requestId = String(request.id);

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        fieldErrors: error.fieldErrors,
        message: error.message,
        requestId,
      },
    });
    return;
  }

  request.log.error(
    {
      error,
      requestId,
    },
    "unhandled request error",
  );

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      fieldErrors: {},
      message: "An unexpected error occurred.",
      requestId,
    },
  });
}
