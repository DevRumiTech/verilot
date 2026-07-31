import { Prisma } from "../generated/prisma/client.js";
import type { PartnerRequestOutcome } from "../generated/prisma/enums.js";

import { prisma } from "../config/database.js";

export interface RecordPartnerRequestInput {
  apiClientId: string;
  httpStatus: number;
  outcome: PartnerRequestOutcome;
  requestBody: Prisma.InputJsonObject;
  requestId: string;
  responseBody: Prisma.InputJsonObject;
}

export interface PartnerRequestRepository {
  record(input: RecordPartnerRequestInput): Promise<void>;
}

export const partnerRequestRepository: PartnerRequestRepository = {
  async record(input) {
    await prisma.partnerApiRequest.create({
      data: {
        apiClientId: input.apiClientId,
        httpStatus: input.httpStatus,
        outcome: input.outcome,
        requestBody: input.requestBody,
        requestId: input.requestId,
        responseBody: input.responseBody,
      },
    });
  },
};
