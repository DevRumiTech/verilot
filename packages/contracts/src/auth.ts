export const USER_ROLES = ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = {
  batchesRead: "batches:read",
  productsRead: "products:read",
  usersRead: "users:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMINISTRATOR: [PERMISSIONS.batchesRead, PERMISSIONS.productsRead, PERMISSIONS.usersRead],
  OPERATOR: [PERMISSIONS.batchesRead, PERMISSIONS.productsRead],
  INSPECTOR: [PERMISSIONS.batchesRead, PERMISSIONS.productsRead],
};

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
