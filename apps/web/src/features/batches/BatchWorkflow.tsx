import {
  API_PATHS,
  MAX_BATCH_PRODUCT_COUNT,
  PERMISSIONS,
  type BatchSummary,
  type BatchWorkflowMutationResponse,
  type ChangeBatchStatusRequest,
  type CreateBatchRequest,
} from "@verilot/contracts";
import { useRef, useState, type FormEvent } from "react";

import { useSession } from "../../auth/SessionProvider.js";
import { ModalDialog } from "../../components/ModalDialog.js";
import { ApiClientError } from "../../lib/api-client.js";
import { createIdempotencyKey } from "../../lib/idempotency.js";

type BatchStatusAction = "activate" | "close";

interface BatchDraftValues {
  code: string;
  expiresAt: string;
  lotNumber: string;
  manufacturedAt: string;
  productName: string;
  serialEnd: string;
  serialPrefix: string;
  serialStart: string;
  sku: string;
}

const EMPTY_BATCH: BatchDraftValues = {
  code: "",
  expiresAt: "",
  lotNumber: "",
  manufacturedAt: "",
  productName: "",
  serialEnd: "",
  serialPrefix: "",
  serialStart: "",
  sku: "",
};

function batchErrorMessage(error: ApiClientError): string {
  if (error.status === 409 || error.status === 404) {
    return error.message;
  }

  if (error.status === 403) {
    return "Your account no longer has permission to manage batches.";
  }

  return "The batch could not be updated. Your entries have been preserved; try again.";
}

function readFieldErrors(error: ApiClientError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(error.fieldErrors).flatMap(([name, messages]) =>
      messages[0] === undefined ? [] : [[name, messages[0]]],
    ),
  );
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999_999 ? parsed : null;
}

function batchQuantity(values: BatchDraftValues): number | null {
  const start = positiveInteger(values.serialStart);
  const end = positiveInteger(values.serialEnd);

  if (start === null || end === null || end < start) {
    return null;
  }

  return end - start + 1;
}

function validateBatch(values: BatchDraftValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const [name, label] of [
    ["code", "batch code"],
    ["lotNumber", "lot number"],
    ["manufacturedAt", "manufacturing date"],
    ["productName", "product name"],
    ["serialPrefix", "serial prefix"],
    ["sku", "SKU"],
  ] as const) {
    if (values[name].trim().length === 0) {
      errors[name] = `Enter the ${label}.`;
    }
  }

  if (
    values.serialPrefix.trim().length > 0 &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.serialPrefix.trim())
  ) {
    errors.serialPrefix = "Use letters, numbers, dots, underscores, or dashes.";
  }

  const start = positiveInteger(values.serialStart);
  const end = positiveInteger(values.serialEnd);
  if (start === null) errors.serialStart = "Enter a whole number from 1 to 999999.";
  if (end === null) errors.serialEnd = "Enter a whole number from 1 to 999999.";

  if (start !== null && end !== null) {
    if (end < start) {
      errors.serialEnd = "The serial range end must not be less than its start.";
    } else if (end - start + 1 > MAX_BATCH_PRODUCT_COUNT) {
      errors.serialEnd = `A batch cannot contain more than ${MAX_BATCH_PRODUCT_COUNT} products.`;
    }
  }

  if (
    values.expiresAt !== "" &&
    values.manufacturedAt !== "" &&
    values.expiresAt <= values.manufacturedAt
  ) {
    errors.expiresAt = "The expiry date must be after the manufacturing date.";
  }

  return errors;
}

function BatchField({
  error,
  label,
  maxLength,
  name,
  onChange,
  type = "text",
  value,
}: {
  error: string | undefined;
  label: string;
  maxLength?: number;
  name: keyof BatchDraftValues;
  onChange(name: keyof BatchDraftValues, value: string): void;
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor={`batch-${name}`}>{label}</label>
      <input
        aria-invalid={error === undefined ? "false" : "true"}
        id={`batch-${name}`}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(type === "number" ? { max: 999_999, min: 1, step: 1 } : {})}
        onChange={(event) => onChange(name, event.target.value)}
        type={type}
        value={value}
      />
      {error === undefined ? null : (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CreateBatchDialog({
  onClose,
  onComplete,
}: {
  onClose(): void;
  onComplete(message: string): void;
}) {
  const { client } = useSession();
  const [values, setValues] = useState(EMPTY_BATCH);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyKey] = useState(() => createIdempotencyKey("batch-create"));
  const quantity = batchQuantity(values);

  function update(name: keyof BatchDraftValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const nextErrors = validateBatch(values);
    setFieldErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const serialStart = positiveInteger(values.serialStart);
    const serialEnd = positiveInteger(values.serialEnd);
    if (serialStart === null || serialEnd === null) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const body: CreateBatchRequest = {
        code: values.code.trim(),
        idempotencyKey,
        lotNumber: values.lotNumber.trim(),
        manufacturedAt: values.manufacturedAt,
        productName: values.productName.trim(),
        serialEnd,
        serialPrefix: values.serialPrefix.trim(),
        serialStart,
        sku: values.sku.trim(),
        ...(values.expiresAt === "" ? {} : { expiresAt: values.expiresAt }),
      };
      const response = await client.request<BatchWorkflowMutationResponse>(API_PATHS.batches, {
        body,
        method: "POST",
      });
      const message = `Draft batch ${response.batch.code} was created; its ${(
        serialEnd -
        serialStart +
        1
      ).toLocaleString("en-CH")}-product serial range was saved.`;
      onComplete(
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
      onClose();
    } catch (reasonCaught) {
      if (reasonCaught instanceof ApiClientError) {
        setFieldErrors(readFieldErrors(reasonCaught));
        setServerError(batchErrorMessage(reasonCaught));
      } else {
        setServerError(
          "The batch could not be updated. Your entries have been preserved; try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog onClose={onClose} title="Create batch">
      <form className="workflow-form workflow-form-grid" onSubmit={(event) => void submit(event)}>
        <p className="dialog-copy span-all">
          Define a draft and its serial bounds. The API creates serialized product records only when
          the draft is activated.
        </p>
        <BatchField
          error={fieldErrors.code}
          label="Batch code"
          maxLength={50}
          name="code"
          onChange={update}
          value={values.code}
        />
        <BatchField
          error={fieldErrors.lotNumber}
          label="Lot number"
          maxLength={80}
          name="lotNumber"
          onChange={update}
          value={values.lotNumber}
        />
        <BatchField
          error={fieldErrors.productName}
          label="Product name"
          maxLength={160}
          name="productName"
          onChange={update}
          value={values.productName}
        />
        <BatchField
          error={fieldErrors.sku}
          label="SKU"
          maxLength={80}
          name="sku"
          onChange={update}
          value={values.sku}
        />
        <BatchField
          error={fieldErrors.manufacturedAt}
          label="Manufactured on"
          name="manufacturedAt"
          onChange={update}
          type="date"
          value={values.manufacturedAt}
        />
        <BatchField
          error={fieldErrors.expiresAt}
          label="Expires on (optional)"
          name="expiresAt"
          onChange={update}
          type="date"
          value={values.expiresAt}
        />
        <BatchField
          error={fieldErrors.serialPrefix}
          label="Serial prefix"
          maxLength={24}
          name="serialPrefix"
          onChange={update}
          value={values.serialPrefix}
        />
        <div className="serial-field-group">
          <BatchField
            error={fieldErrors.serialStart}
            label="Serial start"
            name="serialStart"
            onChange={update}
            type="number"
            value={values.serialStart}
          />
          <BatchField
            error={fieldErrors.serialEnd}
            label="Serial end"
            name="serialEnd"
            onChange={update}
            type="number"
            value={values.serialEnd}
          />
        </div>
        <div className="quantity-summary span-all" role="status">
          <span>Batch quantity</span>
          <strong>
            {quantity === null
              ? "Enter a valid serial range"
              : `${quantity.toLocaleString("en-CH")} products`}
          </strong>
          <small>Maximum {MAX_BATCH_PRODUCT_COUNT.toLocaleString("en-CH")} products.</small>
        </div>
        {serverError === null ? null : (
          <p className="notice span-all" role="alert">
            {serverError}
          </p>
        )}
        <div className="dialog-actions span-all">
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Creating…" : "Create draft batch"}
          </button>
          <button
            className="button button-secondary"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function ChangeBatchStatusDialog({
  action,
  batch,
  onClose,
  onComplete,
}: {
  action: BatchStatusAction;
  batch: BatchSummary;
  onClose(): void;
  onComplete(message: string): void;
}) {
  const { client } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyKey] = useState(() => createIdempotencyKey(`batch-${action}`));
  const title = action === "activate" ? "Activate batch" : "Close batch";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setServerError(null);

    try {
      const body: ChangeBatchStatusRequest = { idempotencyKey };
      const response = await client.request<BatchWorkflowMutationResponse>(
        `${API_PATHS.batches}/${batch.id}/${action}`,
        { body, method: "POST" },
      );
      const message =
        action === "activate"
          ? `Batch ${response.batch.code} was activated; the API confirmed ${response.batch.productCount.toLocaleString("en-CH")} serialized products.`
          : `Batch ${response.batch.code} was closed.`;
      onComplete(
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
      onClose();
    } catch (reasonCaught) {
      setServerError(
        reasonCaught instanceof ApiClientError
          ? batchErrorMessage(reasonCaught)
          : "The batch could not be updated. Try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog onClose={onClose} title={title}>
      <form className="workflow-form" onSubmit={(event) => void submit(event)}>
        <p className="dialog-copy">
          {action === "activate"
            ? `Activate ${batch.code}? The API will create and validate ${(
                batch.serialEnd -
                batch.serialStart +
                1
              ).toLocaleString("en-CH")} serialized product records from the saved range.`
            : `Close ${batch.code}? Closed batches remain available in traceability history.`}
        </p>
        {serverError === null ? null : (
          <p className="notice" role="alert">
            {serverError}
          </p>
        )}
        <div className="dialog-actions">
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? (action === "activate" ? "Activating…" : "Closing…") : title}
          </button>
          <button
            className="button button-secondary"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function CreateBatchButton({ onComplete }: { onComplete(message: string): void }) {
  const { hasPermission } = useSession();
  const [open, setOpen] = useState(false);

  if (!hasPermission(PERMISSIONS.batchesWrite)) {
    return null;
  }

  return (
    <>
      <button className="button button-primary" onClick={() => setOpen(true)} type="button">
        Create batch
      </button>
      {open ? <CreateBatchDialog onClose={() => setOpen(false)} onComplete={onComplete} /> : null}
    </>
  );
}

export function BatchStatusButton({
  batch,
  onComplete,
}: {
  batch: BatchSummary;
  onComplete(message: string): void;
}) {
  const { hasPermission } = useSession();
  const [action, setAction] = useState<BatchStatusAction | null>(null);

  if (
    !hasPermission(PERMISSIONS.batchesWrite) ||
    (batch.status !== "DRAFT" && batch.status !== "ACTIVE")
  ) {
    return null;
  }

  const availableAction: BatchStatusAction = batch.status === "DRAFT" ? "activate" : "close";
  const label = availableAction === "activate" ? "Activate batch" : "Close batch";

  return (
    <>
      <button
        className="button button-primary"
        onClick={() => setAction(availableAction)}
        type="button"
      >
        {label}
      </button>
      {action === null ? null : (
        <ChangeBatchStatusDialog
          action={action}
          batch={batch}
          onClose={() => setAction(null)}
          onComplete={onComplete}
        />
      )}
    </>
  );
}
