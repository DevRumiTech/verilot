import type {
  AlertDetail,
  AlertDetailResponse,
  AlertRule,
  AlertSeverity,
  AlertsResponse,
  AlertStatus,
  AlertSummary,
  AuthSessionResponse,
  JsonValue,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  alertRepository,
  type AlertDetailRecord,
  type AlertRepository,
  type AlertSummaryRecord,
} from "../repositories/alert.repository.js";

export interface ListAlertsServiceInput {
  assignedToId?: string;
  batchId?: string;
  page: number;
  pageSize: number;
  productId?: string;
  rule?: AlertRule;
  search?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
}

function toAlertSummary(alert: AlertSummaryRecord): AlertSummary {
  return {
    assignedTo:
      alert.assignedTo === null
        ? null
        : {
            displayName: alert.assignedTo.displayName,
            id: alert.assignedTo.id,
          },
    batch:
      alert.batch === null
        ? null
        : {
            code: alert.batch.code,
            id: alert.batch.id,
            lotNumber: alert.batch.lotNumber,
            productName: alert.batch.productName,
            sku: alert.batch.sku,
          },
    createdAt: alert.createdAt.toISOString(),
    id: alert.id,
    product:
      alert.product === null
        ? null
        : {
            id: alert.product.id,
            serialNumber: alert.product.serialNumber,
            status: alert.product.status,
          },
    rule: alert.rule,
    severity: alert.severity,
    status: alert.status,
    summary: alert.summary,
    title: alert.title,
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function toAlertDetail(alert: AlertDetailRecord): AlertDetail {
  return {
    ...toAlertSummary(alert),
    custodyEvent:
      alert.event === null
        ? null
        : {
            eventAt: alert.event.eventAt.toISOString(),
            id: alert.event.id,
            recordedAt: alert.event.recordedAt.toISOString(),
            type: alert.event.type,
          },
    decisionAt: alert.decisionAt?.toISOString() ?? null,
    details: alert.details as JsonValue,
    evidenceRequest: alert.evidenceRequest,
    resolvedBy:
      alert.resolvedBy === null
        ? null
        : {
            displayName: alert.resolvedBy.displayName,
            id: alert.resolvedBy.id,
          },
    reviewNotes: alert.reviewNotes,
    verificationAttempt:
      alert.verificationAttempt === null
        ? null
        : {
            attemptedAt: alert.verificationAttempt.attemptedAt.toISOString(),
            id: alert.verificationAttempt.id,
            result: alert.verificationAttempt.result,
            serialNumber: alert.verificationAttempt.serialNumber,
          },
  };
}

export class AlertService {
  public constructor(private readonly repository: AlertRepository) {}

  public async getAlert(
    session: AuthSessionResponse,
    alertId: string,
  ): Promise<AlertDetailResponse> {
    const alert = await this.repository.findByIdAndOrganization(
      alertId,
      session.user.organization.id,
    );

    if (alert === null) {
      throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found.");
    }

    return {
      alert: toAlertDetail(alert),
    };
  }

  public async listAlerts(
    session: AuthSessionResponse,
    input: ListAlertsServiceInput,
  ): Promise<AlertsResponse> {
    const result = await this.repository.list({
      organizationId: session.user.organization.id,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.assignedToId === undefined ? {} : { assignedToId: input.assignedToId }),
      ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
      ...(input.productId === undefined ? {} : { productId: input.productId }),
      ...(input.rule === undefined ? {} : { rule: input.rule }),
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      alerts: result.alerts.map(toAlertSummary),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.pageSize),
      },
    };
  }
}

export const alertService = new AlertService(alertRepository);
