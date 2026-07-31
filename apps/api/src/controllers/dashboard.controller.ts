import type { AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors/api-error.js";
import { dashboardService } from "../services/dashboard.service.js";

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getDashboardSummary(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await dashboardService.getSummary(readSession(request));

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
