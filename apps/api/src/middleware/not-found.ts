import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors/api-error.js";

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction): void {
  next(new ApiError(404, "ROUTE_NOT_FOUND", "Route not found."));
}
