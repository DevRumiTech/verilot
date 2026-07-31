export const USER_ROLES = ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = {
  alertsRead: "alerts:read",
  batchesRead: "batches:read",
  productsRead: "products:read",
  productEventsWrite: "product-events:write",
  locationsRead: "locations:read",
  usersRead: "users:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMINISTRATOR: [
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.productEventsWrite,
    PERMISSIONS.locationsRead,
    PERMISSIONS.usersRead,
  ],
  OPERATOR: [
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.productEventsWrite,
    PERMISSIONS.locationsRead,
  ],
  INSPECTOR: [
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.locationsRead,
  ],
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
