import type { Prisma } from "../src/generated/prisma/client.js";
import {
  AlertRule,
  AlertSeverity,
  AlertStatus,
  BatchStatus,
  EventType,
  OrganizationType,
  ProductStatus,
  RecallStatus,
  TransportMode,
  UserRole,
  UserStatus,
  VerificationResult,
} from "../src/generated/prisma/enums.js";

const MANUFACTURER_ORGANIZATION_ID = seedUuid(1, 1);
const LOGISTICS_ORGANIZATION_ID = seedUuid(1, 2);
const INSPECTOR_ORGANIZATION_ID = seedUuid(1, 3);
const RETAILER_ORGANIZATION_ID = seedUuid(1, 4);

const ADMINISTRATOR_ID = seedUuid(2, 1);
const OPERATOR_ID = seedUuid(2, 2);
const INSPECTOR_ID = seedUuid(2, 3);
const PARTNER_OPERATOR_ID = seedUuid(2, 4);
const DEMO_ID = seedUuid(2, 5);

const SEEDED_AT = new Date("2026-01-05T08:00:00.000Z");
const ACTIVATED_AT = new Date("2026-01-20T09:00:00.000Z");

export const PARTNER_API_KEY = "vlp_partner_2026_local_integration";
export const STABLE_SERIAL_NUMBER = "VL-2026-000042";

export interface SeedCredentials {
  readonly administratorPasswordHash: string;
  readonly apiKeyHash: string;
  readonly demoPasswordHash: string;
  readonly inspectorPasswordHash: string;
  readonly operatorPasswordHash: string;
}

export interface SeedData {
  readonly alerts: Prisma.AlertCreateManyInput[];
  readonly apiClients: Prisma.ApiClientCreateManyInput[];
  readonly auditRecords: Prisma.AuditRecordCreateManyInput[];
  readonly batches: Prisma.BatchCreateManyInput[];
  readonly custodyEvents: Prisma.CustodyEventCreateManyInput[];
  readonly locations: Prisma.LocationCreateManyInput[];
  readonly organizations: Prisma.OrganizationCreateManyInput[];
  readonly products: Prisma.ProductCreateManyInput[];
  readonly recalls: Prisma.RecallCreateManyInput[];
  readonly users: Prisma.UserCreateManyInput[];
  readonly verificationAttempts: Prisma.VerificationAttemptCreateManyInput[];
}

export function seedUuid(group: number, index: number): string {
  const suffix = (group * 1_000_000 + index).toString().padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

function serialNumber(index: number): string {
  return `VL-2026-${index.toString().padStart(6, "0")}`;
}

function batchIndexForProduct(productIndex: number): number {
  return Math.ceil(productIndex / 20);
}

function locationId(index: number): string {
  return seedUuid(3, index);
}

function batchId(index: number): string {
  return seedUuid(4, index);
}

function productId(index: number): string {
  return seedUuid(5, index);
}

function manufacturedEventId(index: number): string {
  return seedUuid(6, index);
}

function progressEventId(index: number): string {
  return seedUuid(6, 1_000 + index);
}

function recallEventId(index: number): string {
  return seedUuid(6, 2_000 + index);
}

function verificationAttemptId(index: number): string {
  return seedUuid(7, index);
}

function alertId(index: number): string {
  return seedUuid(8, index);
}

function recallId(index: number): string {
  return seedUuid(9, index);
}

function auditRecordId(index: number): string {
  return seedUuid(10, index);
}

function buildOrganizations(): Prisma.OrganizationCreateManyInput[] {
  return [
    {
      id: MANUFACTURER_ORGANIZATION_ID,
      name: "VeriLot Manufacturing Romandie",
      slug: "verilot-manufacturing",
      type: OrganizationType.MANUFACTURER,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: LOGISTICS_ORGANIZATION_ID,
      name: "Alpine Transit Romandie",
      slug: "alpine-transit",
      type: OrganizationType.LOGISTICS,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: INSPECTOR_ORGANIZATION_ID,
      name: "Léman Quality Authority",
      slug: "leman-quality",
      type: OrganizationType.INSPECTOR,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: RETAILER_ORGANIZATION_ID,
      name: "Rhône Retail Network",
      slug: "rhone-retail",
      type: OrganizationType.RETAILER,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ];
}

function buildUsers(credentials: SeedCredentials): Prisma.UserCreateManyInput[] {
  return [
    {
      id: ADMINISTRATOR_ID,
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      email: "admin@verilot.local",
      displayName: "Operations Administrator",
      passwordHash: credentials.administratorPasswordHash,
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: OPERATOR_ID,
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      email: "operator@verilot.local",
      displayName: "Supply Chain Operator",
      passwordHash: credentials.operatorPasswordHash,
      role: UserRole.OPERATOR,
      status: UserStatus.ACTIVE,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: INSPECTOR_ID,
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      email: "inspector@verilot.local",
      displayName: "Quality Inspector",
      passwordHash: credentials.inspectorPasswordHash,
      role: UserRole.INSPECTOR,
      status: UserStatus.ACTIVE,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: DEMO_ID,
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      email: "demo@verilot.local",
      displayName: "Recruiter Demo",
      passwordHash: credentials.demoPasswordHash,
      role: UserRole.DEMO,
      status: UserStatus.ACTIVE,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      id: PARTNER_OPERATOR_ID,
      organizationId: LOGISTICS_ORGANIZATION_ID,
      email: "partner@alpine-transit.local",
      displayName: "Partner API Operator",
      passwordHash: credentials.operatorPasswordHash,
      role: UserRole.OPERATOR,
      status: UserStatus.SUSPENDED,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ];
}

function buildLocations(): Prisma.LocationCreateManyInput[] {
  const locations = [
    ["PRI", "Prilly Serialization Centre", "Prilly", "VD", "46.536980", "6.604560"],
    ["MEX", "Mex Production Campus", "Mex", "VD", "46.579640", "6.551470"],
    ["LAU", "Lausanne Inspection Hub", "Lausanne", "VD", "46.519650", "6.632270"],
    ["GVA", "Geneva Logistics Terminal", "Geneva", "GE", "46.204390", "6.143160"],
    ["NYO", "Nyon Custody Point", "Nyon", "VD", "46.383270", "6.239020"],
    ["SIO", "Sion Distribution Centre", "Sion", "VS", "46.233120", "7.360630"],
    ["MAR", "Martigny Transfer Point", "Martigny", "VS", "46.102850", "7.072450"],
    ["MON", "Monthey Receiving Site", "Monthey", "VS", "46.254300", "6.954080"],
  ] as const;

  return locations.map(([code, name, municipality, canton, latitude, longitude], index) => ({
    id: locationId(index + 1),
    code,
    name,
    municipality,
    canton,
    countryCode: "CH",
    latitude,
    longitude,
    isKnown: true,
    createdAt: SEEDED_AT,
  }));
}

function buildBatches(): Prisma.BatchCreateManyInput[] {
  const productNames = [
    "Precision Valve Assembly",
    "Serialized Bearing Set",
    "Thermal Control Module",
    "Medical Flow Regulator",
    "Rail Sensor Housing",
    "Industrial Seal Kit",
    "Pressure Monitoring Unit",
    "Safety Coupling Assembly",
  ] as const;

  return productNames.map((productName, index) => {
    const sequence = index + 1;
    const serialStart = index * 20 + 1;
    const serialEnd = serialStart + 19;
    const isRecalled = sequence >= 7;

    return {
      id: batchId(sequence),
      manufacturerOrganizationId: MANUFACTURER_ORGANIZATION_ID,
      createdById: OPERATOR_ID,
      code: `VL-BATCH-2026-${sequence.toString().padStart(3, "0")}`,
      productName,
      sku: `VL-SKU-${(4100 + sequence).toString()}`,
      lotNumber: `LOT-26-${sequence.toString().padStart(3, "0")}`,
      serialPrefix: "VL-2026-",
      serialStart,
      serialEnd,
      status: isRecalled ? BatchStatus.RECALLED : BatchStatus.ACTIVE,
      manufacturedAt: new Date(
        `2026-01-${(9 + sequence).toString().padStart(2, "0")}T00:00:00.000Z`,
      ),
      expiresAt: new Date(`2029-01-${(9 + sequence).toString().padStart(2, "0")}T00:00:00.000Z`),
      activatedAt: ACTIVATED_AT,
      createdAt: SEEDED_AT,
      updatedAt: isRecalled ? new Date("2026-07-20T11:00:00.000Z") : ACTIVATED_AT,
    };
  });
}

function buildProducts(): Prisma.ProductCreateManyInput[] {
  return Array.from({ length: 160 }, (_, offset) => {
    const index = offset + 1;
    const serial = serialNumber(index);
    const isRecalled = index >= 121;

    return {
      id: productId(index),
      batchId: batchId(batchIndexForProduct(index)),
      serialNumber: serial,
      qrPayload: `https://verilot.local/verify/${serial}`,
      status: isRecalled ? ProductStatus.RECALLED : ProductStatus.VERIFIED,
      activatedAt: ACTIVATED_AT,
      createdAt: SEEDED_AT,
      updatedAt: isRecalled ? new Date("2026-07-20T11:00:00.000Z") : ACTIVATED_AT,
    };
  });
}

function buildRecalls(): Prisma.RecallCreateManyInput[] {
  return [
    {
      id: recallId(1),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      batchId: batchId(7),
      createdById: INSPECTOR_ID,
      reference: "VL-REC-2026-001",
      status: RecallStatus.ACTIVE,
      reason: "Dimensional inspection deviation affecting the complete lot.",
      requestId: "req_seed_recall_001",
      announcedAt: new Date("2026-07-15T09:30:00.000Z"),
    },
    {
      id: recallId(2),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      batchId: batchId(8),
      createdById: ADMINISTRATOR_ID,
      reference: "VL-REC-2026-002",
      status: RecallStatus.COMPLETED,
      reason: "Supplier material certificate did not meet the approved specification.",
      requestId: "req_seed_recall_002",
      announcedAt: new Date("2026-07-20T11:00:00.000Z"),
      completedAt: new Date("2026-07-24T15:30:00.000Z"),
    },
  ];
}

function buildManufacturedEvents(): Prisma.CustodyEventCreateManyInput[] {
  return Array.from({ length: 160 }, (_, offset) => {
    const index = offset + 1;
    const batchIndex = batchIndexForProduct(index);
    const eventAt = new Date(Date.UTC(2026, 0, 9 + batchIndex, 7, index % 20, 0, 0));

    return {
      id: manufacturedEventId(index),
      productId: productId(index),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      actorId: OPERATOR_ID,
      locationId: locationId(batchIndex % 2 === 0 ? 2 : 1),
      type: EventType.MANUFACTURED,
      eventAt,
      recordedAt: new Date(eventAt.getTime() + 60_000),
      notes: "Serial identity commissioned on the production line.",
      idempotencyKey: `seed-manufactured-${index.toString().padStart(3, "0")}`,
      requestId: `req_seed_manufactured_${index.toString().padStart(3, "0")}`,
      metadata: {
        source: "production-line",
        station: `ST-${(index % 6) + 1}`,
      },
    };
  });
}

function progressEventType(index: number): {
  readonly location: number;
  readonly mode: (typeof TransportMode)[keyof typeof TransportMode];
  readonly type: (typeof EventType)[keyof typeof EventType];
} {
  if (index <= 10) {
    return { location: 2, mode: TransportMode.ROAD, type: EventType.PACKED };
  }

  if (index <= 20) {
    return { location: 4, mode: TransportMode.RAIL, type: EventType.DISPATCHED };
  }

  if (index <= 30) {
    return { location: 5, mode: TransportMode.ROAD, type: EventType.RECEIVED };
  }

  if (index <= 40) {
    return { location: 3, mode: TransportMode.ROAD, type: EventType.INSPECTED };
  }

  return { location: 4, mode: TransportMode.ROAD, type: EventType.DISPATCHED };
}

function buildProgressEvents(): Prisma.CustodyEventCreateManyInput[] {
  return Array.from({ length: 50 }, (_, offset) => {
    const index = offset + 1;
    const eventDefinition = progressEventType(index);
    const eventAt =
      index === 42
        ? new Date("2026-07-30T09:00:00.000Z")
        : new Date(Date.UTC(2026, 1, 1 + (index % 20), 10, index % 55, 0, 0));

    return {
      id: progressEventId(index),
      productId: productId(index),
      organizationId:
        eventDefinition.type === EventType.DISPATCHED
          ? LOGISTICS_ORGANIZATION_ID
          : MANUFACTURER_ORGANIZATION_ID,
      actorId: OPERATOR_ID,
      locationId: locationId(eventDefinition.location),
      type: eventDefinition.type,
      eventAt,
      recordedAt: new Date(eventAt.getTime() + 90_000),
      shipmentReference: `CH-26-${(8_000 + index).toString()}`,
      transportMode: eventDefinition.mode,
      notes:
        index === 42
          ? "Geneva custody scan retained for the recruiter anomaly sequence."
          : "Scheduled custody milestone recorded.",
      idempotencyKey: `seed-progress-${index.toString().padStart(3, "0")}`,
      requestId: `req_seed_progress_${index.toString().padStart(3, "0")}`,
      metadata: {
        source: "partner-terminal",
      },
    };
  });
}

function buildRecallEvents(): Prisma.CustodyEventCreateManyInput[] {
  return Array.from({ length: 40 }, (_, offset) => {
    const index = offset + 121;
    const recallIndex = index <= 140 ? 1 : 2;
    const eventAt =
      recallIndex === 1
        ? new Date("2026-07-15T09:30:00.000Z")
        : new Date("2026-07-20T11:00:00.000Z");

    return {
      id: recallEventId(index),
      productId: productId(index),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      actorId: recallIndex === 1 ? INSPECTOR_ID : ADMINISTRATOR_ID,
      locationId: locationId(recallIndex === 1 ? 7 : 8),
      recallId: recallId(recallIndex),
      type: EventType.RECALLED,
      eventAt,
      recordedAt: new Date(eventAt.getTime() + offset * 1_000),
      notes: `Batch recall ${recallIndex} applied to serialized product.`,
      idempotencyKey: `seed-recall-${index.toString().padStart(3, "0")}`,
      requestId: `req_seed_recall_event_${index.toString().padStart(3, "0")}`,
      metadata: {
        recallReference: `VL-REC-2026-${recallIndex.toString().padStart(3, "0")}`,
      },
    };
  });
}

function buildVerificationAttempts(): Prisma.VerificationAttemptCreateManyInput[] {
  return Array.from({ length: 30 }, (_, offset) => {
    const index = offset + 1;

    return {
      id: verificationAttemptId(index),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      serialNumber: index === 30 ? "VL-2026-999999" : serialNumber(index),
      ipHash: index.toString(16).padStart(64, "0"),
      userAgentHash: (index + 100).toString(16).padStart(64, "0"),
      result: index === 30 ? VerificationResult.UNKNOWN : VerificationResult.VERIFIED,
      requestId: `req_seed_verify_${index.toString().padStart(3, "0")}`,
      attemptedAt: new Date(Date.UTC(2026, 6, 1 + (index % 20), 8, index % 50, 0, 0)),
    };
  });
}

function buildAlerts(): Prisma.AlertCreateManyInput[] {
  const rules = [
    AlertRule.DUPLICATE_SCAN,
    AlertRule.IMPOSSIBLE_TRAVEL,
    AlertRule.INVALID_EVENT_ORDER,
    AlertRule.SCAN_AFTER_BLOCK,
    AlertRule.SCAN_AFTER_RECALL,
    AlertRule.UNKNOWN_LOCATION,
    AlertRule.REUSED_IDEMPOTENCY_KEY,
    AlertRule.MISSING_ORGANIZATION_HANDOFF,
    AlertRule.FUTURE_TIMESTAMP,
    AlertRule.DUPLICATE_SCAN,
    AlertRule.IMPOSSIBLE_TRAVEL,
    AlertRule.INVALID_EVENT_ORDER,
    AlertRule.UNKNOWN_LOCATION,
    AlertRule.MISSING_ORGANIZATION_HANDOFF,
    AlertRule.FUTURE_TIMESTAMP,
  ] as const;
  const severities = [
    AlertSeverity.MEDIUM,
    AlertSeverity.HIGH,
    AlertSeverity.MEDIUM,
    AlertSeverity.HIGH,
    AlertSeverity.CRITICAL,
    AlertSeverity.LOW,
    AlertSeverity.HIGH,
    AlertSeverity.MEDIUM,
    AlertSeverity.HIGH,
    AlertSeverity.MEDIUM,
    AlertSeverity.CRITICAL,
    AlertSeverity.LOW,
    AlertSeverity.MEDIUM,
    AlertSeverity.HIGH,
    AlertSeverity.MEDIUM,
  ] as const;

  const eventAlerts = rules.map((rule, offset): Prisma.AlertCreateManyInput => {
    const index = offset + 1;
    const status =
      index <= 8
        ? AlertStatus.OPEN
        : index <= 11
          ? AlertStatus.IN_REVIEW
          : index <= 13
            ? AlertStatus.RESOLVED
            : AlertStatus.DISMISSED;
    const isClosed = status === AlertStatus.RESOLVED || status === AlertStatus.DISMISSED;

    return {
      id: alertId(index),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      productId: productId(index),
      batchId: batchId(batchIndexForProduct(index)),
      eventId: progressEventId(index),
      assignedToId: index % 2 === 0 ? INSPECTOR_ID : ADMINISTRATOR_ID,
      ...(isClosed
        ? {
            resolvedById: INSPECTOR_ID,
            reviewNotes: "Reviewed against the stored custody record.",
            decisionAt: new Date("2026-07-25T12:00:00.000Z"),
          }
        : {}),
      rule,
      severity: severities[offset] ?? AlertSeverity.MEDIUM,
      status,
      title: `${rule
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")} detected`,
      summary: `Deterministic rule ${rule} requires review for ${serialNumber(index)}.`,
      details:
        rule === AlertRule.IMPOSSIBLE_TRAVEL
          ? {
              distanceKilometres: 135.4 + index,
              elapsedMinutes: 4,
              speedKilometresPerHour: 2031 + index,
            }
          : {
              eventReference: `req_seed_progress_${index.toString().padStart(3, "0")}`,
              rule,
            },
      createdAt: new Date(Date.UTC(2026, 6, 10 + (index % 10), 9, index, 0, 0)),
      updatedAt: isClosed
        ? new Date("2026-07-25T12:00:00.000Z")
        : new Date(Date.UTC(2026, 6, 10 + (index % 10), 9, index, 0, 0)),
    };
  });

  eventAlerts.push({
    id: alertId(16),
    organizationId: MANUFACTURER_ORGANIZATION_ID,
    verificationAttemptId: verificationAttemptId(30),
    assignedToId: INSPECTOR_ID,
    rule: AlertRule.EXCESSIVE_VERIFICATION_ATTEMPTS,
    severity: AlertSeverity.MEDIUM,
    status: AlertStatus.EVIDENCE_REQUESTED,
    title: "Excessive Verification Attempts detected",
    summary: "Repeated verification requests for an unknown serial require partner evidence.",
    details: {
      attemptsInWindow: 12,
      windowMinutes: 10,
    },
    evidenceRequest: "Confirm the source system and scanning workflow.",
    createdAt: new Date("2026-07-28T14:20:00.000Z"),
    updatedAt: new Date("2026-07-28T14:25:00.000Z"),
  });

  return eventAlerts;
}

function buildAuditRecords(): Prisma.AuditRecordCreateManyInput[] {
  const actions = [
    "BATCH_CREATED",
    "BATCH_ACTIVATED",
    "PRODUCT_SERIALIZED",
    "CUSTODY_EVENT_RECORDED",
    "ALERT_OPENED",
    "ALERT_REVIEWED",
    "RECALL_STARTED",
    "PRODUCT_STATUS_CHANGED",
  ] as const;

  return Array.from({ length: 120 }, (_, offset) => {
    const index = offset + 1;
    const actorIndex = index % 3;
    const actorId =
      actorIndex === 0 ? ADMINISTRATOR_ID : actorIndex === 1 ? OPERATOR_ID : INSPECTOR_ID;
    const actorEmail =
      actorIndex === 0
        ? "admin@verilot.local"
        : actorIndex === 1
          ? "operator@verilot.local"
          : "inspector@verilot.local";
    const actorRole =
      actorIndex === 0
        ? UserRole.ADMINISTRATOR
        : actorIndex === 1
          ? UserRole.OPERATOR
          : UserRole.INSPECTOR;
    const action = actions[offset % actions.length] ?? "PRODUCT_STATUS_CHANGED";
    const referencedProduct = ((index - 1) % 160) + 1;

    return {
      id: auditRecordId(index),
      organizationId: MANUFACTURER_ORGANIZATION_ID,
      actorId,
      actorEmail,
      actorRole,
      action,
      entityType: action.startsWith("BATCH")
        ? "Batch"
        : action.startsWith("ALERT")
          ? "Alert"
          : action.startsWith("RECALL")
            ? "Recall"
            : "Product",
      entityId: productId(referencedProduct),
      reason: "Seeded operational history record.",
      afterData: {
        action,
        sequence: index,
        serialNumber: serialNumber(referencedProduct),
      },
      requestId: `req_seed_audit_${index.toString().padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2026, 0, 21 + (offset % 180), 7 + (offset % 10), 0, 0, 0)),
    };
  });
}

function buildApiClients(credentials: SeedCredentials): Prisma.ApiClientCreateManyInput[] {
  return [
    {
      id: seedUuid(11, 1),
      organizationId: LOGISTICS_ORGANIZATION_ID,
      createdById: PARTNER_OPERATOR_ID,
      name: "Alpine Transit Partner API",
      keyPrefix: PARTNER_API_KEY.slice(0, 16),
      keyHash: credentials.apiKeyHash,
      createdAt: SEEDED_AT,
    },
  ];
}

export function buildSeedData(credentials: SeedCredentials): SeedData {
  return {
    organizations: buildOrganizations(),
    users: buildUsers(credentials),
    locations: buildLocations(),
    batches: buildBatches(),
    products: buildProducts(),
    recalls: buildRecalls(),
    custodyEvents: [...buildManufacturedEvents(), ...buildProgressEvents(), ...buildRecallEvents()],
    verificationAttempts: buildVerificationAttempts(),
    alerts: buildAlerts(),
    auditRecords: buildAuditRecords(),
    apiClients: buildApiClients(credentials),
  };
}
