import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors/api-error.js";
import { userService } from "../services/user.service.js";

export async function listUsers(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const session = request.authenticatedSession;

  if (session === undefined) {
    next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }

  try {
    const result = await userService.listUsers(session);

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
