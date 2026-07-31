import { API_PATHS, type AuthSessionResponse } from "@verilot/contracts";

import { apiClient, type ApiClient } from "../lib/api-client.js";

export interface SignInCredentials {
  email: string;
  password: string;
}

export class AuthApi {
  constructor(private readonly client: ApiClient = apiClient) {}

  async loadSession(signal?: AbortSignal): Promise<AuthSessionResponse> {
    return this.client.request<AuthSessionResponse>(API_PATHS.auth.session, {
      notifyUnauthorized: false,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async signIn(credentials: SignInCredentials): Promise<AuthSessionResponse> {
    const session = await this.client.request<AuthSessionResponse>(API_PATHS.auth.login, {
      body: credentials,
      method: "POST",
      notifyUnauthorized: false,
    });
    this.client.setCsrfToken(session.csrfToken);
    return session;
  }

  async signOut(): Promise<void> {
    await this.client.request<void>(API_PATHS.auth.logout, {
      method: "POST",
      notifyUnauthorized: false,
    });
    this.client.clearCsrfToken();
  }
}

export const authApi = new AuthApi();
