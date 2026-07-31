export const APPLICATION_NAME = "VeriLot";

export const API_VERSION = "v1";

export const API_PREFIX = `/api/${API_VERSION}` as const;

export const AUTH_COOKIE_NAME = "verilot_session";

export const CSRF_HEADER_NAME = "x-csrf-token";

export const API_PATHS = {
  auth: {
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    session: `${API_PREFIX}/auth/session`,
  },
  users: `${API_PREFIX}/users`,
  verification: `${API_PREFIX}/verification`,
} as const;

export const SYSTEM_PATHS = {
  docs: "/api/docs",
  health: "/api/health",
} as const;
