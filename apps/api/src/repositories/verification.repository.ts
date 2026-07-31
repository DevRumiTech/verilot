import type { Prisma, VerificationResult } from "../generated/prisma/client.js";
import { prisma } from "../config/database.js";

const publicProductSelect = {
  batch: {
    select: {
      code: true,
      expiresAt: true,
      lotNumber: true,
      manufacturedAt: true,
      manufacturerOrganization: {
        select: {
          id: true,
          name: true,
        },
      },
      productName: true,
      status: true,
    },
  },
  custodyEvents: {
    orderBy: [{ eventAt: "asc" }, { recordedAt: "asc" }],
    select: {
      eventAt: true,
      location: {
        select: {
          canton: true,
          municipality: true,
        },
      },
      organization: {
        select: {
          type: true,
        },
      },
      type: true,
    },
  },
  serialNumber: true,
  status: true,
} satisfies Prisma.ProductSelect;

export type PublicProductRecord = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect;
}>;

export interface VerificationAttemptInput {
  ipHash: string;
  organizationId?: string;
  requestId: string;
  result: VerificationResult;
  serialNumber: string;
  userAgentHash?: string;
}

export interface VerificationRepository {
  findPublicProduct(serialNumber: string): Promise<PublicProductRecord | null>;
  recordAttempt(input: VerificationAttemptInput): Promise<void>;
}

export const verificationRepository: VerificationRepository = {
  async findPublicProduct(serialNumber) {
    return prisma.product.findUnique({
      select: publicProductSelect,
      where: {
        serialNumber,
      },
    });
  },

  async recordAttempt(input) {
    await prisma.verificationAttempt.create({
      data: {
        ipHash: input.ipHash,
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
        requestId: input.requestId,
        result: input.result,
        serialNumber: input.serialNumber,
        ...(input.userAgentHash === undefined ? {} : { userAgentHash: input.userAgentHash }),
      },
    });
  },
};
