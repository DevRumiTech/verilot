import { createHash } from "node:crypto";

import type { AuthSessionResponse, RecallWorkflowMutationResponse } from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  recallWorkflowRepository,
  type MutateRecallInput,
  type RecallWorkflowRepository,
} from "../repositories/recall-workflow.repository.js";

interface RecallWorkflowCommonInput {
  idempotencyKey: string;
  now?: Date;
  requestId: string;
}

export type RecallWorkflowInput =
  | (RecallWorkflowCommonInput & {
      action: "create";
      batchId: string;
      reason: string;
      reference: string;
    })
  | (RecallWorkflowCommonInput & {
      action: "complete";
      recallId: string;
    });

function hashRequest(input: RecallWorkflowInput): string {
  const request =
    input.action === "create"
      ? {
          action: input.action,
          batchId: input.batchId,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          reference: input.reference,
        }
      : {
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          recallId: input.recallId,
        };

  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export class RecallWorkflowService {
  public constructor(private readonly repository: RecallWorkflowRepository) {}

  public async mutateRecall(
    session: AuthSessionResponse,
    input: RecallWorkflowInput,
  ): Promise<RecallWorkflowMutationResponse> {
    const commonInput = {
      actorEmail: session.user.email,
      actorId: session.user.id,
      actorRole: session.user.role,
      idempotencyKey: input.idempotencyKey,
      now: input.now ?? new Date(),
      organizationId: session.user.organization.id,
      requestHash: hashRequest(input),
      requestId: input.requestId,
    };
    const repositoryInput: MutateRecallInput =
      input.action === "create"
        ? {
            ...commonInput,
            action: input.action,
            batchId: input.batchId,
            reason: input.reason,
            reference: input.reference,
          }
        : {
            ...commonInput,
            action: input.action,
            recallId: input.recallId,
          };

    const result = await this.repository.mutate(repositoryInput);

    switch (result.kind) {
      case "batch-not-found":
        throw new ApiError(404, "BATCH_NOT_FOUND", "Batch not found.");
      case "idempotency-conflict":
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used with different data.",
        );
      case "invalid-transition":
        throw new ApiError(409, "INVALID_RECALL_TRANSITION", "The recall transition is invalid.");
      case "recall-not-found":
        throw new ApiError(404, "RECALL_NOT_FOUND", "Recall not found.");
      case "reference-conflict":
        throw new ApiError(
          409,
          "RECALL_REFERENCE_CONFLICT",
          "The recall reference is already in use.",
        );
      case "created":
      case "replayed":
        return {
          recall: result.recall,
          replayed: result.kind === "replayed",
        };
    }
  }
}

export const recallWorkflowService = new RecallWorkflowService(recallWorkflowRepository);
