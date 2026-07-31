import { API_VERSION } from "@verilot/contracts";

export interface HealthSnapshot {
  readonly apiVersion: typeof API_VERSION;
  readonly service: "verilot-api";
  readonly status: "ok";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

export function getHealthSnapshot(
  now: Date = new Date(),
  uptimeSeconds: number = process.uptime(),
): HealthSnapshot {
  return {
    apiVersion: API_VERSION,
    service: "verilot-api",
    status: "ok",
    timestamp: now.toISOString(),
    uptimeSeconds: Math.floor(uptimeSeconds),
  };
}
