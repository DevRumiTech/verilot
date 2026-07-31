import { API_PATHS } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import {
  readAuthCookie,
  serializeAuthCookie,
  serializeClearedAuthCookie,
} from "../security/auth-token.js";
import { authService } from "../services/auth.service.js";
import { toFieldErrors } from "../validation/zod.js";

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password.").max(128, "Password is too long."),
});

export async function signIn(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = signInSchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The sign-in request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await authService.signIn(parsed.data);

    response.setHeader(
      "Set-Cookie",
      serializeAuthCookie(result.token, new Date(result.response.expiresAt)),
    );
    response.status(200).json({
      data: result.response,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSession(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await authService.getSession(readAuthCookie(request.headers.cookie));

    response.status(200).json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

export async function signOut(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.signOut(readAuthCookie(request.headers.cookie));
    response.setHeader("Set-Cookie", serializeClearedAuthCookie());
    response.location(API_PATHS.auth.login).status(204).end();
  } catch (error) {
    next(error);
  }
}
