import { randomUUID } from "node:crypto";

import type { AuthSessionResponse, AuthenticatedUser } from "@verilot/contracts";
import { compare } from "bcryptjs";

import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { UserStatus } from "../generated/prisma/enums.js";
import {
  authRepository,
  type AuthenticationUserRecord,
  type AuthRepository,
} from "../repositories/auth.repository.js";
import {
  authValueMatchesHash,
  createAuthToken,
  createCsrfToken,
  hashAuthValue,
  verifyAuthToken,
} from "../security/auth-token.js";

const INVALID_CREDENTIALS_HASH = "$2b$12$04BoGj9UoLBtROAPG1fqE.JsApfNyiGYXKfTTjNrhuTyn3oVLR8LG";

export interface SignInInput {
  email: string;
  now?: Date;
  password: string;
}

export interface SignInResult {
  response: AuthSessionResponse;
  token: string;
}

function authenticationRequired(): ApiError {
  return new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
}

function toAuthenticatedUser(user: AuthenticationUserRecord): AuthenticatedUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      type: user.organization.type,
    },
    role: user.role,
  };
}

export class AuthService {
  public constructor(private readonly repository: AuthRepository) {}

  public async getSession(
    token: string | undefined,
    now = new Date(),
  ): Promise<AuthSessionResponse> {
    if (token === undefined) {
      throw authenticationRequired();
    }

    const claims = await verifyAuthToken(token);

    if (claims === null) {
      throw authenticationRequired();
    }

    const session = await this.repository.findActiveSession({
      id: claims.sessionId,
      now,
      tokenHash: hashAuthValue(token),
      userId: claims.userId,
    });

    if (
      session === null ||
      !authValueMatchesHash(claims.csrfToken, session.csrfHash) ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw authenticationRequired();
    }

    return {
      csrfToken: claims.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
      user: toAuthenticatedUser(session.user),
    };
  }

  public async signIn(input: SignInInput): Promise<SignInResult> {
    const user = await this.repository.findUserByEmail(input.email);
    const passwordMatches = await compare(
      input.password,
      user?.passwordHash ?? INVALID_CREDENTIALS_HASH,
    );

    if (user === null || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const signedInAt = input.now ?? new Date();
    const expiresAt = new Date(signedInAt.getTime() + env.SESSION_TTL_HOURS * 60 * 60 * 1_000);
    const sessionId = randomUUID();
    const csrfToken = createCsrfToken();
    const token = await createAuthToken({
      csrfToken,
      expiresAt,
      sessionId,
      userId: user.id,
    });

    await this.repository.createSession({
      csrfHash: hashAuthValue(csrfToken),
      expiresAt,
      id: sessionId,
      signedInAt,
      tokenHash: hashAuthValue(token),
      userId: user.id,
    });

    return {
      response: {
        csrfToken,
        expiresAt: expiresAt.toISOString(),
        user: toAuthenticatedUser(user),
      },
      token,
    };
  }

  public async signOut(token: string | undefined, now = new Date()): Promise<void> {
    if (token === undefined) {
      return;
    }

    const claims = await verifyAuthToken(token);

    if (claims === null) {
      return;
    }

    await this.repository.revokeSession(claims.sessionId, hashAuthValue(token), now);
  }
}

export const authService = new AuthService(authRepository);
