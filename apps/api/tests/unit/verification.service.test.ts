import { describe, expect, it } from "vitest";

import { BatchStatus, ProductStatus } from "../../src/generated/prisma/enums.js";
import { resolveVerificationResult } from "../../src/services/verification.service.js";

describe("verification result resolution", () => {
  it.each([
    [ProductStatus.VERIFIED, BatchStatus.ACTIVE, "VERIFIED"],
    [ProductStatus.PENDING, BatchStatus.ACTIVE, "WARNING"],
    [ProductStatus.WARNING, BatchStatus.ACTIVE, "WARNING"],
    [ProductStatus.BLOCKED, BatchStatus.ACTIVE, "BLOCKED"],
    [ProductStatus.DESTROYED, BatchStatus.CLOSED, "BLOCKED"],
    [ProductStatus.RECALLED, BatchStatus.ACTIVE, "RECALLED"],
    [ProductStatus.VERIFIED, BatchStatus.RECALLED, "RECALLED"],
  ])("maps %s in a %s batch to %s", (productStatus, batchStatus, expected) => {
    expect(resolveVerificationResult(productStatus, batchStatus)).toBe(expected);
  });
});
