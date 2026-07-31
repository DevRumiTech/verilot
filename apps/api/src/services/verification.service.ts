import { createHmac } from "node:crypto";

import type { PublicVerificationResponse } from "@verilot/contracts";

import { env } from "../config/env.js";
import {
  BatchStatus,
  ProductStatus,
  VerificationResult,
  type BatchStatus as BatchStatusValue,
  type ProductStatus as ProductStatusValue,
  type VerificationResult as VerificationResultValue,
} from "../generated/prisma/enums.js";
import { ApiError } from "../errors/api-error.js";
import {
  verificationRepository,
  type PublicProductRecord,
  type VerificationRepository,
} from "../repositories/verification.repository.js";

type PublicResult = Exclude<VerificationResultValue, "UNKNOWN">;

export interface VerifyProductInput {
  checkedAt?: Date;
  ipAddress: string;
  requestId: string;
  serialNumber: string;
  userAgent?: string;
}

function hashSensitiveValue(value: string): string {
  return createHmac("sha256", env.DATA_HASH_SECRET).update(value).digest("hex");
}

export function resolveVerificationResult(
  productStatus: ProductStatusValue,
  batchStatus: BatchStatusValue,
): PublicResult {
  if (batchStatus === BatchStatus.RECALLED || productStatus === ProductStatus.RECALLED) {
    return VerificationResult.RECALLED;
  }

  switch (productStatus) {
    case ProductStatus.BLOCKED:
    case ProductStatus.DESTROYED:
      return VerificationResult.BLOCKED;
    case ProductStatus.PENDING:
    case ProductStatus.WARNING:
      return VerificationResult.WARNING;
    case ProductStatus.VERIFIED:
      return VerificationResult.VERIFIED;
  }
}

function toPublicResponse(
  product: PublicProductRecord,
  result: PublicResult,
  checkedAt: Date,
): PublicVerificationResponse {
  return {
    batch: {
      code: product.batch.code,
      expiresAt: product.batch.expiresAt?.toISOString() ?? null,
      lotNumber: product.batch.lotNumber,
      manufacturedAt: product.batch.manufacturedAt.toISOString(),
      manufacturer: product.batch.manufacturerOrganization.name,
      productName: product.batch.productName,
    },
    checkedAt: checkedAt.toISOString(),
    result,
    serialNumber: product.serialNumber,
    timeline: product.custodyEvents.map((event) => ({
      eventAt: event.eventAt.toISOString(),
      location:
        event.location === null
          ? null
          : {
              canton: event.location.canton,
              municipality: event.location.municipality,
            },
      organizationType: event.organization.type,
      type: event.type,
    })),
  };
}

export class VerificationService {
  public constructor(private readonly repository: VerificationRepository) {}

  public async verifyProduct(input: VerifyProductInput): Promise<PublicVerificationResponse> {
    const checkedAt = input.checkedAt ?? new Date();
    const product = await this.repository.findPublicProduct(input.serialNumber);
    const ipHash = hashSensitiveValue(input.ipAddress);
    const userAgentHash =
      input.userAgent === undefined ? undefined : hashSensitiveValue(input.userAgent);

    if (product === null) {
      await this.repository.recordAttempt({
        ipHash,
        requestId: input.requestId,
        result: VerificationResult.UNKNOWN,
        serialNumber: input.serialNumber,
        ...(userAgentHash === undefined ? {} : { userAgentHash }),
      });

      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    }

    const result = resolveVerificationResult(product.status, product.batch.status);

    await this.repository.recordAttempt({
      ipHash,
      organizationId: product.batch.manufacturerOrganization.id,
      requestId: input.requestId,
      result,
      serialNumber: product.serialNumber,
      ...(userAgentHash === undefined ? {} : { userAgentHash }),
    });

    return toPublicResponse(product, result, checkedAt);
  }
}

export const verificationService = new VerificationService(verificationRepository);
