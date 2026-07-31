import type { PublicVerificationResponse } from "@verilot/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { PartnerRequestOutcome } from "../generated/prisma/enums.js";

import { ApiError } from "../errors/api-error.js";
import {
  partnerRequestRepository,
  type PartnerRequestRepository,
} from "../repositories/partner-request.repository.js";

interface PartnerRequestCommonInput {
  apiClientId: string;
  requestId: string;
  serialNumber: string;
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export class PartnerRequestService {
  public constructor(private readonly repository: PartnerRequestRepository) {}

  public async recordError(
    input: PartnerRequestCommonInput & {
      error: ApiError;
    },
  ): Promise<void> {
    await this.repository.record({
      apiClientId: input.apiClientId,
      httpStatus: input.error.statusCode,
      outcome: PartnerRequestOutcome.INVALID,
      requestBody: toJsonObject({
        method: "GET",
        serialNumber: input.serialNumber,
      }),
      requestId: input.requestId,
      responseBody: toJsonObject({
        error: {
          code: input.error.code,
          fieldErrors: input.error.fieldErrors,
          message: input.error.message,
          requestId: input.requestId,
        },
      }),
    });
  }

  public async recordVerification(
    input: PartnerRequestCommonInput & {
      verification: PublicVerificationResponse;
    },
  ): Promise<void> {
    await this.repository.record({
      apiClientId: input.apiClientId,
      httpStatus: 200,
      outcome: PartnerRequestOutcome.VALID,
      requestBody: toJsonObject({
        method: "GET",
        serialNumber: input.serialNumber,
      }),
      requestId: input.requestId,
      responseBody: toJsonObject({
        data: input.verification,
      }),
    });
  }
}

export const partnerRequestService = new PartnerRequestService(partnerRequestRepository);
