import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const userSummarySelect = {
  displayName: true,
  email: true,
  id: true,
  organization: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

export type UserSummaryRecord = Prisma.UserGetPayload<{
  select: typeof userSummarySelect;
}>;

export interface UserRepository {
  listByOrganization(organizationId: string): Promise<readonly UserSummaryRecord[]>;
}

export const userRepository: UserRepository = {
  async listByOrganization(organizationId) {
    return prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: userSummarySelect,
      where: {
        organizationId,
      },
    });
  },
};
