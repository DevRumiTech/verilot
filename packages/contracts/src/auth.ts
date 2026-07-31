export const USER_ROLES = ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedUser {
  displayName: string;
  email: string;
  id: string;
  organization: {
    id: string;
    name: string;
    type: string;
  };
  role: UserRole;
}

export interface AuthSessionResponse {
  csrfToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
}
