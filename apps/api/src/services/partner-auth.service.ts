import { authValueMatchesHash } from "../security/auth-token.js";
import {
  partnerAuthRepository,
  type PartnerAuthRepository,
} from "../repositories/partner-auth.repository.js";

const API_KEY_PATTERN = /^vlp_[A-Za-z0-9_-]{20,116}$/;
const API_KEY_PREFIX_LENGTH = 16;
const DUMMY_KEY_HASH = "0".repeat(64);

export interface PartnerApiClientContext {
  id: string;
  organizationId: string;
}

export type AuthenticatePartnerResult =
  | {
      client: PartnerApiClientContext;
      kind: "authenticated";
    }
  | {
      apiClientId?: string;
      kind: "invalid" | "malformed" | "missing";
    };

export class PartnerAuthService {
  public constructor(private readonly repository: PartnerAuthRepository) {}

  public async authenticate(
    apiKey: string | undefined,
    now = new Date(),
  ): Promise<AuthenticatePartnerResult> {
    if (apiKey === undefined || apiKey === "") {
      return {
        kind: "missing",
      };
    }

    if (!API_KEY_PATTERN.test(apiKey)) {
      return {
        kind: "malformed",
      };
    }

    const client = await this.repository.findByKeyPrefix(apiKey.slice(0, API_KEY_PREFIX_LENGTH));
    const keyMatches = authValueMatchesHash(apiKey, client?.keyHash ?? DUMMY_KEY_HASH);

    if (
      client === null ||
      !keyMatches ||
      client.revokedAt !== null ||
      (client.expiresAt !== null && client.expiresAt <= now)
    ) {
      return {
        ...(client === null ? {} : { apiClientId: client.id }),
        kind: "invalid",
      };
    }

    await this.repository.updateLastUsedAt(client.id, now);

    return {
      client: {
        id: client.id,
        organizationId: client.organizationId,
      },
      kind: "authenticated",
    };
  }
}

export const partnerAuthService = new PartnerAuthService(partnerAuthRepository);
