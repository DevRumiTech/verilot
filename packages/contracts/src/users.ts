import type { UserRole } from "./auth.js";

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserSummary {
  displayName: string;
  email: string;
  id: string;
  organization: {
    id: string;
    name: string;
    type: string;
  };
  role: UserRole;
  status: UserStatus;
}

export interface UsersResponse {
  users: readonly UserSummary[];
}
