import type { BatchStatus, PaginationMetadata } from "./batches.js";

export const PRODUCT_STATUSES = [
  "PENDING",
  "VERIFIED",
  "WARNING",
  "BLOCKED",
  "RECALLED",
  "DESTROYED",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const EVENT_TYPES = [
  "MANUFACTURED",
  "PACKED",
  "DISPATCHED",
  "RECEIVED",
  "INSPECTED",
  "SOLD",
  "RETURNED",
  "BLOCKED",
  "RELEASED",
  "RECALLED",
  "DESTROYED",
  "CORRECTION",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const TRANSPORT_MODES = ["ROAD", "RAIL", "AIR", "WATER", "HAND_CARRIED", "UNKNOWN"] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export interface ProductBatchSummary {
  code: string;
  id: string;
  lotNumber: string;
  productName: string;
  sku: string;
  status: BatchStatus;
}

export interface ProductSummary {
  activatedAt: string | null;
  batch: ProductBatchSummary;
  blockedAt: string | null;
  blockReason: string | null;
  eventCount: number;
  id: string;
  serialNumber: string;
  status: ProductStatus;
  updatedAt: string;
}

export interface ProductCustodyEvent {
  actor: {
    displayName: string;
  } | null;
  eventAt: string;
  id: string;
  location: {
    canton: string;
    countryCode: string;
    municipality: string;
    name: string;
  } | null;
  notes: string | null;
  organization: {
    name: string;
    type: string;
  };
  recordedAt: string;
  shipmentReference: string | null;
  transportMode: TransportMode | null;
  type: EventType;
}

export interface ProductDetail extends ProductSummary {
  custodyEvents: readonly ProductCustodyEvent[];
}

export interface ProductsResponse {
  pagination: PaginationMetadata;
  products: readonly ProductSummary[];
}

export interface ProductDetailResponse {
  product: ProductDetail;
}
