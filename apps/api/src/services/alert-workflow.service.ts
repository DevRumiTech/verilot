import { createHash } from "node:crypto";

import type { AlertWorkflowMutationResponse, AuthSessionResponse } from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  alertWorkflowRepository,
  type AlertWorkflowRepository,
  type MutateAlertInput,
} from "../repositories/alert-workflow.repository.js";

interface AlertWorkflowCommonInput {
  alertId: string;
  idempotencyKey: string;
  now?: Date;
  requestId: string;
}

export type AlertWorkflowInput =
  | (AlertWorkflowCommonInput & {
      action: "assign";
      assignedToId: string;
      reason?: string;
    })
  | (AlertWorkflowCommonInput & {
      action: "dismiss" | "resolve";
      reviewNotes: string;
    });

function hashRequest(input: AlertWorkflowInput): string {
  const request =
    input.action === "assign"
      ? {
          action: input.action,
          alertId: input.alertId,
          assignedToId: input.assignedToId,
          idempotencyKey: input.idempotencyKey,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        }
      : {
          action: input.action,
          alertId: input.alertId,
          idempotencyKey: input.idempotencyKey,
          reviewNotes: input.reviewNotes,
        };

  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export class AlertWorkflowService {
  public constructor(private readonly repository: AlertWorkflowRepository) {}

  public async mutateAlert(
    session: AuthSessionResponse,
    input: AlertWorkflowInput,
  ): Promise<AlertWorkflowMutationResponse> {
    const commonInput = {
      actorEmail: session.user.email,
      actorId: session.user.id,
      actorRole: session.user.role,
      alertId: input.alertId,
      idempotencyKey: input.idempotencyKey,
      now: input.now ?? new Date(),
      organizationId: session.user.organization.id,
      requestHash: hashRequest(input),
      requestId: input.requestId,
    };
    const repositoryInput: MutateAlertInput =
      input.action === "assign"
        ? {
            ...commonInput,
            action: input.action,
            assignedToId: input.assignedToId,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          }
        : {
            ...commonInput,
            action: input.action,
            reviewNotes: input.reviewNotes,
          };

    const result = await this.repository.mutate(repositoryInput);

    switch (result.kind) {
      case "alert-not-found":
        throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found.");
      case "assignment-target-not-found":
        throw new ApiError(404, "ASSIGNMENT_TARGET_NOT_FOUND", "Assignment target not found.");
      case "idempotency-conflict":
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used with different data.",
        );
      case "invalid-transition":
        throw new ApiError(409, "INVALID_ALERT_TRANSITION", "The alert transition is invalid.");
      case "created":
      case "replayed":
        return {
          alert: result.alert,
          replayed: result.kind === "replayed",
        };
    }
  }
}

export const alertWorkflowService = new AlertWorkflowService(alertWorkflowRepository);
