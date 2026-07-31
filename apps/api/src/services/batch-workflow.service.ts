import { createHash } from "node:crypto";

import type { AuthSessionResponse, BatchWorkflowMutationResponse } from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  batchWorkflowRepository,
  type BatchWorkflowRepository,
  type MutateBatchInput,
} from "../repositories/batch-workflow.repository.js";

interface BatchWorkflowCommonInput {
  idempotencyKey: string;
  now?: Date;
  requestId: string;
}

export type BatchWorkflowInput =
  | (BatchWorkflowCommonInput & {
      action: "create";
      code: string;
      expiresAt?: Date;
      lotNumber: string;
      manufacturedAt: Date;
      productName: string;
      serialEnd: number;
      serialPrefix: string;
      serialStart: number;
      sku: string;
    })
  | (BatchWorkflowCommonInput & {
      action: "activate" | "close";
      batchId: string;
    });

function hashRequest(input: BatchWorkflowInput): string {
  const request =
    input.action === "create"
      ? {
          action: input.action,
          code: input.code,
          expiresAt: input.expiresAt?.toISOString() ?? null,
          idempotencyKey: input.idempotencyKey,
          lotNumber: input.lotNumber,
          manufacturedAt: input.manufacturedAt.toISOString(),
          productName: input.productName,
          serialEnd: input.serialEnd,
          serialPrefix: input.serialPrefix,
          serialStart: input.serialStart,
          sku: input.sku,
        }
      : {
          action: input.action,
          batchId: input.batchId,
          idempotencyKey: input.idempotencyKey,
        };

  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export class BatchWorkflowService {
  public constructor(private readonly repository: BatchWorkflowRepository) {}

  public async mutateBatch(
    session: AuthSessionResponse,
    input: BatchWorkflowInput,
  ): Promise<BatchWorkflowMutationResponse> {
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
    const repositoryInput: MutateBatchInput =
      input.action === "create"
        ? {
            ...commonInput,
            action: input.action,
            code: input.code,
            lotNumber: input.lotNumber,
            manufacturedAt: input.manufacturedAt,
            productName: input.productName,
            serialEnd: input.serialEnd,
            serialPrefix: input.serialPrefix,
            serialStart: input.serialStart,
            sku: input.sku,
            ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
          }
        : {
            ...commonInput,
            action: input.action,
            batchId: input.batchId,
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
      case "identity-conflict":
        throw new ApiError(
          409,
          "BATCH_IDENTITY_CONFLICT",
          "The batch code or lot number is already in use.",
        );
      case "invalid-transition":
        throw new ApiError(409, "INVALID_BATCH_TRANSITION", "The batch transition is invalid.");
      case "serial-conflict":
        throw new ApiError(
          409,
          "BATCH_SERIAL_CONFLICT",
          "The batch serial range conflicts with existing product identities.",
        );
      case "created":
      case "replayed":
        return {
          batch: result.batch,
          replayed: result.kind === "replayed",
        };
    }
  }
}

export const batchWorkflowService = new BatchWorkflowService(batchWorkflowRepository);
