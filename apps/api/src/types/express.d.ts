import type { AuthSessionResponse } from "@verilot/contracts";

declare global {
  namespace Express {
    interface Request {
      authenticatedSession?: AuthSessionResponse;
      partnerApiClient?: {
        id: string;
        organizationId: string;
      };
    }
  }
}

export {};
