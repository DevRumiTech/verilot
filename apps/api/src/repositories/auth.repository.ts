import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";
import { UserStatus } from "../generated/prisma/enums.js";

const authenticationUserSelect = {
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
  organizationId: true,
  passwordHash: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

const authenticatedSessionSelect = {
  csrfHash: true,
  expiresAt: true,
  id: true,
  user: {
    select: authenticationUserSelect,
  },
} satisfies Prisma.AuthSessionSelect;

export type AuthenticationUserRecord = Prisma.UserGetPayload<{
  select: typeof authenticationUserSelect;
}>;

export type AuthenticatedSessionRecord = Prisma.AuthSessionGetPayload<{
  select: typeof authenticatedSessionSelect;
}>;

export interface CreateSessionInput {
  csrfHash: string;
  expiresAt: Date;
  id: string;
  signedInAt: Date;
  tokenHash: string;
  userId: string;
}

export interface FindActiveSessionInput {
  id: string;
  now: Date;
  tokenHash: string;
  userId: string;
}

export interface AuthRepository {
  createSession(input: CreateSessionInput): Promise<void>;
  findActiveSession(input: FindActiveSessionInput): Promise<AuthenticatedSessionRecord | null>;
  findUserByEmail(email: string): Promise<AuthenticationUserRecord | null>;
  revokeSession(id: string, tokenHash: string, revokedAt: Date): Promise<void>;
}

export const authRepository: AuthRepository = {
  async createSession(input) {
    await prisma.$transaction([
      prisma.authSession.create({
        data: {
          csrfHash: input.csrfHash,
          expiresAt: input.expiresAt,
          id: input.id,
          tokenHash: input.tokenHash,
          userId: input.userId,
        },
      }),
      prisma.user.update({
        data: {
          lastSignedInAt: input.signedInAt,
        },
        where: {
          id: input.userId,
        },
      }),
    ]);
  },

  async findActiveSession(input) {
    return prisma.authSession.findFirst({
      select: authenticatedSessionSelect,
      where: {
        expiresAt: {
          gt: input.now,
        },
        id: input.id,
        revokedAt: null,
        tokenHash: input.tokenHash,
        user: {
          status: UserStatus.ACTIVE,
        },
        userId: input.userId,
      },
    });
  },

  async findUserByEmail(email) {
    return prisma.user.findUnique({
      select: authenticationUserSelect,
      where: {
        email,
      },
    });
  },

  async revokeSession(id, tokenHash, revokedAt) {
    await prisma.authSession.updateMany({
      data: {
        revokedAt,
      },
      where: {
        id,
        revokedAt: null,
        tokenHash,
      },
    });
  },
};
