import type {
  AuditRecordDetail,
  AuditRecordDetailResponse,
  AuditRecordsResponse,
  AuditRecordSummary,
  AuthSessionResponse,
  JsonValue,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  auditRecordRepository,
  type AuditRecordDetailRecord,
  type AuditRecordRepository,
  type AuditRecordSummaryRecord,
} from "../repositories/audit-record.repository.js";

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "credential",
  "password",
  "token",
  "secret",
  "session",
  "cookie",
  "csrf",
  "apikey",
  "keyhash",
  "passwordhash",
  "tokenhash",
  "csrfhash",
  "iphash",
  "useragenthash",
] as const;

export interface ListAuditRecordsServiceInput {
  action?: string;
  actorId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  entityId?: string;
  entityType?: string;
  page: number;
  pageSize: number;
  requestId?: string;
  search?: string;
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

  return SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part));
}

export function redactSensitiveJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveJson(nestedValue as JsonValue),
      ]),
    );
  }

  return value;
}

function toAuditRecordSummary(record: AuditRecordSummaryRecord): AuditRecordSummary {
  return {
    action: record.action,
    actor:
      record.actor === null
        ? null
        : {
            displayName: record.actor.displayName,
            id: record.actor.id,
          },
    actorEmail: record.actorEmail,
    actorRole: record.actorRole,
    createdAt: record.createdAt.toISOString(),
    entityId: record.entityId,
    entityType: record.entityType,
    id: record.id,
    reason: record.reason,
    requestId: record.requestId,
  };
}

function toAuditRecordDetail(record: AuditRecordDetailRecord): AuditRecordDetail {
  return {
    ...toAuditRecordSummary(record),
    afterData:
      record.afterData === null ? null : redactSensitiveJson(record.afterData as JsonValue),
    beforeData:
      record.beforeData === null ? null : redactSensitiveJson(record.beforeData as JsonValue),
  };
}

export class AuditRecordService {
  public constructor(private readonly repository: AuditRecordRepository) {}

  public async getAuditRecord(
    session: AuthSessionResponse,
    auditRecordId: string,
  ): Promise<AuditRecordDetailResponse> {
    const auditRecord = await this.repository.findByIdAndOrganization(
      auditRecordId,
      session.user.organization.id,
    );

    if (auditRecord === null) {
      throw new ApiError(404, "AUDIT_RECORD_NOT_FOUND", "Audit record not found.");
    }

    return {
      auditRecord: toAuditRecordDetail(auditRecord),
    };
  }

  public async listAuditRecords(
    session: AuthSessionResponse,
    input: ListAuditRecordsServiceInput,
  ): Promise<AuditRecordsResponse> {
    const result = await this.repository.list({
      organizationId: session.user.organization.id,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.action === undefined ? {} : { action: input.action }),
      ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
      ...(input.createdFrom === undefined ? {} : { createdFrom: input.createdFrom }),
      ...(input.createdTo === undefined ? {} : { createdTo: input.createdTo }),
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
      ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.search === undefined ? {} : { search: input.search }),
    });

    return {
      auditRecords: result.auditRecords.map(toAuditRecordSummary),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.pageSize),
      },
    };
  }
}

export const auditRecordService = new AuditRecordService(auditRecordRepository);
