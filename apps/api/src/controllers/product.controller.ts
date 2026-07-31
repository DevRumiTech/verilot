import { PRODUCT_STATUSES, type AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { productService } from "../services/product.service.js";
import { toFieldErrors } from "../validation/zod.js";

const productListQuerySchema = z.object({
  batchId: z.string().uuid("Enter a valid batch identifier.").optional(),
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
});

const productParamsSchema = z.object({
  productId: z.string().uuid("Enter a valid product identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getProduct(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = productParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The product request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await productService.getProduct(readSession(request), parsed.data.productId);

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listProducts(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = productListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The product list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await productService.listProducts(readSession(request), {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.batchId === undefined
        ? {}
        : {
            batchId: parsed.data.batchId,
          }),
      ...(parsed.data.search === undefined
        ? {}
        : {
            search: parsed.data.search,
          }),
      ...(parsed.data.status === undefined
        ? {}
        : {
            status: parsed.data.status,
          }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
