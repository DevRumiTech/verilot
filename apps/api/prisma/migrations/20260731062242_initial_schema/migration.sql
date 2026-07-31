-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('MANUFACTURER', 'LOGISTICS', 'INSPECTOR', 'RETAILER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'OPERATOR', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RECALLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING', 'VERIFIED', 'WARNING', 'BLOCKED', 'RECALLED', 'DESTROYED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MANUFACTURED', 'PACKED', 'DISPATCHED', 'RECEIVED', 'INSPECTED', 'SOLD', 'RETURNED', 'BLOCKED', 'RELEASED', 'RECALLED', 'DESTROYED', 'CORRECTION');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'WATER', 'HAND_CARRIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertRule" AS ENUM ('DUPLICATE_SCAN', 'IMPOSSIBLE_TRAVEL', 'INVALID_EVENT_ORDER', 'SCAN_AFTER_BLOCK', 'SCAN_AFTER_RECALL', 'UNKNOWN_LOCATION', 'REUSED_IDEMPOTENCY_KEY', 'EXCESSIVE_VERIFICATION_ATTEMPTS', 'MISSING_ORGANIZATION_HANDOFF', 'FUTURE_TIMESTAMP');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'EVIDENCE_REQUESTED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('VERIFIED', 'WARNING', 'BLOCKED', 'RECALLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PartnerRequestOutcome" AS ENUM ('VALID', 'DUPLICATE', 'INVALID');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSignedInAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "csrfHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "municipality" VARCHAR(100) NOT NULL,
    "canton" CHAR(2) NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'CH',
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "isKnown" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "manufacturerOrganizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "productName" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "lotNumber" VARCHAR(80) NOT NULL,
    "serialPrefix" VARCHAR(24) NOT NULL,
    "serialStart" INTEGER NOT NULL,
    "serialEnd" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "manufacturedAt" DATE NOT NULL,
    "expiresAt" DATE,
    "activatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "serialNumber" VARCHAR(50) NOT NULL,
    "qrPayload" VARCHAR(500) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMPTZ(3),
    "blockedAt" TIMESTAMPTZ(3),
    "blockReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_events" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "locationId" UUID,
    "recallId" UUID,
    "correctedEventId" UUID,
    "type" "EventType" NOT NULL,
    "eventAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipmentReference" VARCHAR(100),
    "transportMode" "TransportMode",
    "notes" VARCHAR(1000),
    "idempotencyKey" VARCHAR(120),
    "requestId" VARCHAR(100) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_attempts" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "serialNumber" VARCHAR(80) NOT NULL,
    "ipHash" CHAR(64) NOT NULL,
    "userAgentHash" CHAR(64),
    "result" "VerificationResult" NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID,
    "batchId" UUID,
    "eventId" UUID,
    "verificationAttemptId" UUID,
    "assignedToId" UUID,
    "resolvedById" UUID,
    "rule" "AlertRule" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "details" JSONB NOT NULL,
    "evidenceRequest" VARCHAR(1000),
    "reviewNotes" VARCHAR(2000),
    "decisionAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "status" "RecallStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" VARCHAR(1000) NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "announcedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "actorEmail" VARCHAR(254),
    "actorRole" "UserRole",
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(1000),
    "beforeData" JSONB,
    "afterData" JSONB,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "keyPrefix" VARCHAR(24) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_api_requests" (
    "id" UUID NOT NULL,
    "apiClientId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(120),
    "requestId" VARCHAR(100) NOT NULL,
    "outcome" "PartnerRequestOutcome" NOT NULL,
    "requestBody" JSONB NOT NULL,
    "responseBody" JSONB NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_api_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "bucketKey" VARCHAR(180) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("bucketKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_role_idx" ON "users"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_expiresAt_idx" ON "auth_sessions"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_municipality_canton_idx" ON "locations"("municipality", "canton");

-- CreateIndex
CREATE UNIQUE INDEX "batches_code_key" ON "batches"("code");

-- CreateIndex
CREATE INDEX "batches_manufacturerOrganizationId_status_createdAt_idx" ON "batches"("manufacturerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "batches_manufacturerOrganizationId_lotNumber_key" ON "batches"("manufacturerOrganizationId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "products_serialNumber_key" ON "products"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "products_qrPayload_key" ON "products"("qrPayload");

-- CreateIndex
CREATE INDEX "products_batchId_status_idx" ON "products"("batchId", "status");

-- CreateIndex
CREATE INDEX "products_status_updatedAt_idx" ON "products"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "custody_events_productId_eventAt_recordedAt_idx" ON "custody_events"("productId", "eventAt", "recordedAt");

-- CreateIndex
CREATE INDEX "custody_events_organizationId_recordedAt_idx" ON "custody_events"("organizationId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "custody_events_organizationId_idempotencyKey_key" ON "custody_events"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "verification_attempts_serialNumber_attemptedAt_idx" ON "verification_attempts"("serialNumber", "attemptedAt");

-- CreateIndex
CREATE INDEX "verification_attempts_ipHash_attemptedAt_idx" ON "verification_attempts"("ipHash", "attemptedAt");

-- CreateIndex
CREATE INDEX "alerts_organizationId_status_severity_createdAt_idx" ON "alerts"("organizationId", "status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_productId_status_idx" ON "alerts"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_rule_eventId_key" ON "alerts"("rule", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_rule_verificationAttemptId_key" ON "alerts"("rule", "verificationAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_reference_key" ON "recalls"("reference");

-- CreateIndex
CREATE INDEX "recalls_organizationId_status_announcedAt_idx" ON "recalls"("organizationId", "status", "announcedAt");

-- CreateIndex
CREATE INDEX "recalls_batchId_status_idx" ON "recalls"("batchId", "status");

-- CreateIndex
CREATE INDEX "audit_records_organizationId_createdAt_idx" ON "audit_records"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_records_entityType_entityId_createdAt_idx" ON "audit_records"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_records_action_createdAt_idx" ON "audit_records"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyPrefix_key" ON "api_clients"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyHash_key" ON "api_clients"("keyHash");

-- CreateIndex
CREATE INDEX "api_clients_organizationId_revokedAt_idx" ON "api_clients"("organizationId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_api_requests_requestId_key" ON "partner_api_requests"("requestId");

-- CreateIndex
CREATE INDEX "partner_api_requests_apiClientId_createdAt_idx" ON "partner_api_requests"("apiClientId", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_organizationId_scope_key_key" ON "idempotency_records"("organizationId", "scope", "key");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expiresAt_idx" ON "rate_limit_counters"("expiresAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_manufacturerOrganizationId_fkey" FOREIGN KEY ("manufacturerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_recallId_fkey" FOREIGN KEY ("recallId") REFERENCES "recalls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_correctedEventId_fkey" FOREIGN KEY ("correctedEventId") REFERENCES "custody_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "custody_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_verificationAttemptId_fkey" FOREIGN KEY ("verificationAttemptId") REFERENCES "verification_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_api_requests" ADD CONSTRAINT "partner_api_requests_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
