import {
  API_PATHS,
  PERMISSIONS,
  type BatchesResponse,
  type CompleteRecallRequest,
  type CreateRecallRequest,
  type RecallDetail,
  type RecallWorkflowMutationResponse,
} from "@verilot/contracts";
import { useRef, useState, type FormEvent } from "react";

import { useSession } from "../../auth/SessionProvider.js";
import { ModalDialog } from "../../components/ModalDialog.js";
import { ApiClientError } from "../../lib/api-client.js";
import { createIdempotencyKey } from "../../lib/idempotency.js";
import { moveKeyboardPosition } from "../../lib/keyboard.js";
import { useApiResource } from "../../lib/use-api-resource.js";

function recallErrorMessage(error: ApiClientError): string {
  if (error.status === 409 || error.status === 404) {
    return error.message;
  }

  if (error.status === 403) {
    return "Your account no longer has permission to manage recalls.";
  }

  return "The recall could not be updated. Your entries have been preserved; try again.";
}

function readFieldErrors(error: ApiClientError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(error.fieldErrors).flatMap(([name, messages]) =>
      messages[0] === undefined ? [] : [[name, messages[0]]],
    ),
  );
}

function CreateRecallDialog({
  onClose,
  onComplete,
}: {
  onClose(): void;
  onComplete(message: string): void;
}) {
  const { client } = useSession();
  const batches = useApiResource<BatchesResponse>(
    `${API_PATHS.batches}?page=1&pageSize=100&status=ACTIVE`,
  );
  const [batchId, setBatchId] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyKey] = useState(() => createIdempotencyKey("recall-create"));

  function moveToFirstRecallError(errors: Record<string, string>): void {
    const name = ["batchId", "reference", "reason"].find((field) => errors[field] !== undefined);
    const id =
      name === "batchId"
        ? "recall-batch"
        : name === "reference"
          ? "recall-reference"
          : name === "reason"
            ? "recall-reason"
            : null;
    moveKeyboardPosition(id === null ? null : document.getElementById(id));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const nextErrors: Record<string, string> = {};
    if (batchId === "") nextErrors.batchId = "Select an active batch.";
    if (reference.trim().length === 0) nextErrors.reference = "Enter a recall reference.";
    if (reason.trim().length === 0) nextErrors.reason = "Enter the reason for this recall.";
    setFieldErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      moveToFirstRecallError(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const body: CreateRecallRequest = {
        batchId,
        idempotencyKey,
        reason: reason.trim(),
        reference: reference.trim(),
      };
      const response = await client.request<RecallWorkflowMutationResponse>(API_PATHS.recalls, {
        body,
        method: "POST",
      });
      const message = `Recall ${response.recall.reference} was created and the batch was marked as recalled.`;
      onComplete(
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
      onClose();
    } catch (reasonCaught) {
      if (reasonCaught instanceof ApiClientError) {
        const responseErrors = readFieldErrors(reasonCaught);
        setFieldErrors(responseErrors);
        setServerError(recallErrorMessage(reasonCaught));
        moveToFirstRecallError(responseErrors);
      } else {
        setServerError(
          "The recall could not be updated. Your entries have been preserved; try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog
      description="Creating a recall marks the selected active batch and its eligible products as recalled."
      onClose={onClose}
      title="Create recall"
    >
      <form className="workflow-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="recall-batch">Active batch</label>
          <select
            aria-describedby={
              fieldErrors.batchId === undefined
                ? "recall-batch-help"
                : "recall-batch-help recall-batch-error"
            }
            aria-invalid={fieldErrors.batchId === undefined ? "false" : "true"}
            disabled={batches.status !== "success" || batches.data.batches.length === 0}
            id="recall-batch"
            name="batchId"
            onChange={(event) => setBatchId(event.target.value)}
            required
            value={batchId}
          >
            <option value="">Select a batch</option>
            {batches.status === "success"
              ? batches.data.batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.code} · {batch.productName}
                  </option>
                ))
              : null}
          </select>
          {batches.status === "loading" ? (
            <p className="field-help" id="recall-batch-help" role="status">
              Loading active batches…
            </p>
          ) : null}
          {batches.status === "error" ? (
            <p className="field-error" id="recall-batch-help" role="alert">
              Active batches could not be loaded.
            </p>
          ) : null}
          {batches.status === "success" && batches.data.batches.length === 0 ? (
            <p className="field-help" id="recall-batch-help">
              No active batches are currently eligible for recall.
            </p>
          ) : batches.status === "success" ? (
            <p className="field-help" id="recall-batch-help">
              Select an active batch in your organization.
            </p>
          ) : null}
          {fieldErrors.batchId === undefined ? null : (
            <p className="field-error" id="recall-batch-error" role="alert">
              {fieldErrors.batchId}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="recall-reference">Recall reference</label>
          <input
            aria-describedby={
              fieldErrors.reference === undefined ? undefined : "recall-reference-error"
            }
            aria-invalid={fieldErrors.reference === undefined ? "false" : "true"}
            id="recall-reference"
            maxLength={60}
            name="reference"
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          />
          {fieldErrors.reference === undefined ? null : (
            <p className="field-error" id="recall-reference-error" role="alert">
              {fieldErrors.reference}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="recall-reason">Reason</label>
          <textarea
            aria-describedby={fieldErrors.reason === undefined ? undefined : "recall-reason-error"}
            aria-invalid={fieldErrors.reason === undefined ? "false" : "true"}
            id="recall-reason"
            maxLength={1000}
            name="reason"
            onChange={(event) => setReason(event.target.value)}
            required
            rows={5}
            value={reason}
          />
          {fieldErrors.reason === undefined ? null : (
            <p className="field-error" id="recall-reason-error" role="alert">
              {fieldErrors.reason}
            </p>
          )}
        </div>
        {serverError === null ? null : (
          <p className="notice" role="alert">
            {serverError}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button button-primary"
            disabled={
              submitting || batches.status !== "success" || batches.data.batches.length === 0
            }
            type="submit"
          >
            {submitting ? "Creating…" : "Create recall"}
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

function CompleteRecallDialog({
  onClose,
  onComplete,
  recall,
}: {
  onClose(): void;
  onComplete(message: string): void;
  recall: RecallDetail;
}) {
  const { client } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyKey] = useState(() => createIdempotencyKey("recall-complete"));

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setServerError(null);

    try {
      const body: CompleteRecallRequest = { idempotencyKey };
      const response = await client.request<RecallWorkflowMutationResponse>(
        `${API_PATHS.recalls}/${recall.id}/complete`,
        { body, method: "POST" },
      );
      const message = `Recall ${response.recall.reference} was marked as completed.`;
      onComplete(
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
      onClose();
    } catch (reasonCaught) {
      setServerError(
        reasonCaught instanceof ApiClientError
          ? recallErrorMessage(reasonCaught)
          : "The recall could not be updated. Try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog
      description={`Mark ${recall.reference} as completed? The recall and its audit history remain available.`}
      onClose={onClose}
      title="Complete recall"
    >
      <form className="workflow-form" onSubmit={(event) => void submit(event)}>
        {serverError === null ? null : (
          <p className="notice" role="alert">
            {serverError}
          </p>
        )}
        <div className="dialog-actions">
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Completing…" : "Complete recall"}
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

export function CreateRecallButton({ onComplete }: { onComplete(message: string): void }) {
  const { hasPermission } = useSession();
  const [open, setOpen] = useState(false);

  if (!hasPermission(PERMISSIONS.recallsManage)) {
    return null;
  }

  return (
    <>
      <button className="button button-primary" onClick={() => setOpen(true)} type="button">
        Create recall
      </button>
      {open ? <CreateRecallDialog onClose={() => setOpen(false)} onComplete={onComplete} /> : null}
    </>
  );
}

export function CompleteRecallButton({
  onComplete,
  recall,
}: {
  onComplete(message: string): void;
  recall: RecallDetail;
}) {
  const { hasPermission } = useSession();
  const [open, setOpen] = useState(false);

  if (!hasPermission(PERMISSIONS.recallsManage) || recall.status !== "ACTIVE") {
    return null;
  }

  return (
    <>
      <button className="button button-primary" onClick={() => setOpen(true)} type="button">
        Complete recall
      </button>
      {open ? (
        <CompleteRecallDialog
          onClose={() => setOpen(false)}
          onComplete={onComplete}
          recall={recall}
        />
      ) : null}
    </>
  );
}
