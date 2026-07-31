export const VERIFICATION_RESULTS = [
  "VERIFIED",
  "WARNING",
  "BLOCKED",
  "RECALLED",
  "UNKNOWN",
] as const;

export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export interface PublicVerificationTimelineEntry {
  eventAt: string;
  location: {
    canton: string;
    municipality: string;
  } | null;
  organizationType: string;
  type: string;
}

export interface PublicVerificationResponse {
  batch: {
    code: string;
    expiresAt: string | null;
    lotNumber: string;
    manufacturedAt: string;
    manufacturer: string;
    productName: string;
  };
  checkedAt: string;
  result: Exclude<VerificationResult, "UNKNOWN">;
  serialNumber: string;
  timeline: readonly PublicVerificationTimelineEntry[];
}
