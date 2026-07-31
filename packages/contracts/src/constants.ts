export const APPLICATION_NAME = "VeriLot";

export const API_VERSION = "v1";

export const API_PREFIX = `/api/${API_VERSION}` as const;

export const PARTNER_API_PREFIX = `/api/partner/${API_VERSION}` as const;

export const AUTH_COOKIE_NAME = "verilot_session";

export const CSRF_HEADER_NAME = "x-csrf-token";

export const PARTNER_API_KEY_HEADER_NAME = "x-api-key";

export const API_PATHS = {
  alerts: `${API_PREFIX}/alerts`,
  auditRecords: `${API_PREFIX}/audit-records`,
  batches: `${API_PREFIX}/batches`,
  dashboardSummary: `${API_PREFIX}/dashboard/summary`,
  products: `${API_PREFIX}/products`,
  recalls: `${API_PREFIX}/recalls`,
  locations: `${API_PREFIX}/locations`,
  auth: {
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    session: `${API_PREFIX}/auth/session`,
  },
  users: `${API_PREFIX}/users`,
  verification: `${API_PREFIX}/verification`,
} as const;

export const PARTNER_API_PATHS = {
  verification: `${PARTNER_API_PREFIX}/verification`,
} as const;

export const SYSTEM_PATHS = {
  docs: "/api/docs",
  openApi: "/api/openapi.json",
  health: "/api/health",
} as const;
