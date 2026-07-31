import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const partnerApiClientSelect = {
  expiresAt: true,
  id: true,
  keyHash: true,
  organizationId: true,
  revokedAt: true,
} satisfies Prisma.ApiClientSelect;

export type PartnerApiClientRecord = Prisma.ApiClientGetPayload<{
  select: typeof partnerApiClientSelect;
}>;

export interface PartnerAuthRepository {
  findByKeyPrefix(keyPrefix: string): Promise<PartnerApiClientRecord | null>;
  updateLastUsedAt(apiClientId: string, lastUsedAt: Date): Promise<void>;
}

export const partnerAuthRepository: PartnerAuthRepository = {
  async findByKeyPrefix(keyPrefix) {
    return prisma.apiClient.findUnique({
      select: partnerApiClientSelect,
      where: {
        keyPrefix,
      },
    });
  },

  async updateLastUsedAt(apiClientId, lastUsedAt) {
    await prisma.apiClient.update({
      data: {
        lastUsedAt,
      },
      where: {
        id: apiClientId,
      },
    });
  },
};
