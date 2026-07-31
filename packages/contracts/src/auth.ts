export const USER_ROLES = ["ADMINISTRATOR", "OPERATOR", "INSPECTOR", "DEMO"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = {
  alertsManage: "alerts:manage",
  alertsRead: "alerts:read",
  auditRecordsRead: "audit-records:read",
  batchesRead: "batches:read",
  batchesWrite: "batches:write",
  dashboardRead: "dashboard:read",
  productsRead: "products:read",
  productEventsWrite: "product-events:write",
  recallsManage: "recalls:manage",
  recallsRead: "recalls:read",
  locationsRead: "locations:read",
  usersRead: "users:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMINISTRATOR: [
    PERMISSIONS.alertsManage,
    PERMISSIONS.alertsRead,
    PERMISSIONS.auditRecordsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.batchesWrite,
    PERMISSIONS.dashboardRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.productEventsWrite,
    PERMISSIONS.recallsManage,
    PERMISSIONS.recallsRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.usersRead,
  ],
  OPERATOR: [
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.batchesWrite,
    PERMISSIONS.dashboardRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.productEventsWrite,
    PERMISSIONS.recallsRead,
    PERMISSIONS.locationsRead,
  ],
  INSPECTOR: [
    PERMISSIONS.alertsManage,
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.dashboardRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.recallsRead,
    PERMISSIONS.locationsRead,
  ],
  DEMO: [
    PERMISSIONS.alertsRead,
    PERMISSIONS.batchesRead,
    PERMISSIONS.dashboardRead,
    PERMISSIONS.productsRead,
    PERMISSIONS.recallsRead,
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
