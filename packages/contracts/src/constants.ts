export const APPLICATION_NAME = "VeriLot";

export const API_VERSION = "v1";

export const API_PREFIX = `/api/${API_VERSION}` as const;

export const SYSTEM_PATHS = {
  docs: "/api/docs",
  health: "/api/health",
} as const;
