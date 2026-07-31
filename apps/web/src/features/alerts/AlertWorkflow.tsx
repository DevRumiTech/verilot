import {
  API_PATHS,
  PERMISSIONS,
  type AlertDetail,
  type AlertWorkflowMutationResponse,
  type AssignAlertRequest,
  type DecideAlertRequest,
  type UsersResponse,
} from "@verilot/contracts";
import { useRef, useState, type FormEvent } from "react";

import { ModalDialog } from "../../components/ModalDialog.js";
import { useSession } from "../../auth/SessionProvider.js";
import { ApiClientError } from "../../lib/api-client.js";
import { createIdempotencyKey } from "../../lib/idempotency.js";
import { useApiResource } from "../../lib/use-api-resource.js";

type WorkflowAction = "assign" | "dismiss" | "resolve";

function requestErrorMessage(error: ApiClientError): string {
  if (error.status === 409) {
    return error.message;
  }

  if (error.status === 403) {
    return "Your account no longer has permission to update this alert.";
  }

  if (error.status === 404) {
    return "This alert or assignee is no longer available.";
  }

  return "The alert could not be updated. Your entries have been preserved; try again.";
}

function OrganizationAssigneeField({
  onChange,
  value,
}: {
  onChange(value: string): void;
  value: string;
}) {
  const { session } = useSession();
  const resource = useApiResource<UsersResponse>(API_PATHS.users);

  if (session === null) {
    return null;
  }

  const users =
    resource.status === "success"
      ? resource.data.users.filter(
          (user) =>
            user.status === "ACTIVE" && user.organization.id === session.user.organization.id,
        )
      : [session.user];

  return (
    <div className="field">
      <label htmlFor="alert-assignee">Assign to</label>
      <select id="alert-assignee" onChange={(event) => onChange(event.target.value)} value={value}>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName} · {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      {resource.status === "loading" ? (
        <p className="field-help">Loading organization users…</p>
      ) : null}
      {resource.status === "error" ? (
        <p className="field-error">
          The user list is unavailable. You can still assign the alert to yourself.
        </p>
      ) : null}
    </div>
  );
}

function SelfAssigneeField({ value }: { value: string }) {
  const { session } = useSession();

  if (session === null) {
    return null;
  }

  return (
    <div className="field">
      <label htmlFor="alert-assignee">Assign to</label>
      <select disabled id="alert-assignee" value={value}>
        <option value={session.user.id}>{session.user.displayName} · Current user</option>
      </select>
      <p className="field-help">Your role can assign this alert to your own active account.</p>
    </div>
  );
}

function AlertWorkflowDialog({
  action,
  alertId,
  onClose,
  onComplete,
}: {
  action: WorkflowAction;
  alertId: string;
  onClose(): void;
  onComplete(message: string): void;
}) {
  const { client, hasPermission, session } = useSession();
  const [assigneeId, setAssigneeId] = useState(session?.user.id ?? "");
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyKey] = useState(() => createIdempotencyKey(`alert-${action}`));
  const canReadUsers = hasPermission(PERMISSIONS.usersRead);
  const title =
    action === "assign" ? "Assign alert" : action === "resolve" ? "Resolve alert" : "Dismiss alert";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const nextErrors: Record<string, string> = {};

    if (action === "assign" && assigneeId === "") {
      nextErrors.assignedToId = "Select an assignee.";
    }

    if (action !== "assign" && reviewNotes.trim().length === 0) {
      nextErrors.reviewNotes = "Enter review notes for this decision.";
    }

    setFieldErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const body: AssignAlertRequest | DecideAlertRequest =
        action === "assign"
          ? {
              assignedToId: assigneeId,
              idempotencyKey,
              ...(reason.trim().length === 0 ? {} : { reason: reason.trim() }),
            }
          : {
              idempotencyKey,
              reviewNotes: reviewNotes.trim(),
            };
      const response = await client.request<AlertWorkflowMutationResponse>(
        `${API_PATHS.alerts}/${alertId}/${action}`,
        { body, method: "POST" },
      );
      const message =
        action === "assign"
          ? `Alert assigned to ${response.alert.assignedTo?.displayName ?? "the selected user"}.`
          : action === "resolve"
            ? "Alert resolved and the investigation record was updated."
            : "Alert dismissed and the investigation record was updated.";
      onComplete(
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
      onClose();
    } catch (reasonCaught) {
      if (reasonCaught instanceof ApiClientError) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(reasonCaught.fieldErrors).flatMap(([name, messages]) =>
              messages[0] === undefined ? [] : [[name, messages[0]]],
            ),
          ),
        );
        setServerError(requestErrorMessage(reasonCaught));
      } else {
        setServerError(
          "The alert could not be updated. Your entries have been preserved; try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog onClose={onClose} title={title}>
      <form className="workflow-form" onSubmit={(event) => void submit(event)}>
        {action === "assign" ? (
          <>
            {canReadUsers ? (
              <OrganizationAssigneeField onChange={setAssigneeId} value={assigneeId} />
            ) : (
              <SelfAssigneeField value={assigneeId} />
            )}
            {fieldErrors.assignedToId === undefined ? null : (
              <p className="field-error" role="alert">
                {fieldErrors.assignedToId}
              </p>
            )}
            <div className="field">
              <label htmlFor="alert-assignment-reason">Assignment reason (optional)</label>
              <textarea
                id="alert-assignment-reason"
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                value={reason}
              />
              {fieldErrors.reason === undefined ? null : (
                <p className="field-error">{fieldErrors.reason}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="dialog-copy">
              {action === "resolve"
                ? "Record the evidence supporting resolution."
                : "Record why this alert does not require further investigation."}
            </p>
            <div className="field">
              <label htmlFor="alert-review-notes">Review notes</label>
              <textarea
                aria-invalid={fieldErrors.reviewNotes === undefined ? "false" : "true"}
                id="alert-review-notes"
                maxLength={2000}
                onChange={(event) => setReviewNotes(event.target.value)}
                rows={6}
                value={reviewNotes}
              />
              {fieldErrors.reviewNotes === undefined ? null : (
                <p className="field-error" role="alert">
                  {fieldErrors.reviewNotes}
                </p>
              )}
            </div>
          </>
        )}
        {serverError === null ? null : (
          <p className="notice" role="alert">
            {serverError}
          </p>
        )}
        <div className="dialog-actions">
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting
              ? "Saving…"
              : action === "assign"
                ? "Confirm assignment"
                : action === "resolve"
                  ? "Resolve alert"
                  : "Dismiss alert"}
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

export function AlertWorkflow({
  alert,
  onComplete,
}: {
  alert: AlertDetail;
  onComplete(message: string): void;
}) {
  const { hasPermission } = useSession();
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const canManage = hasPermission(PERMISSIONS.alertsManage);
  const isClosed = alert.status === "RESOLVED" || alert.status === "DISMISSED";

  if (!canManage || isClosed) {
    return null;
  }

  return (
    <section className="surface workflow-panel" aria-labelledby="alert-actions-title">
      <div>
        <p className="eyebrow">Investigation actions</p>
        <h2 id="alert-actions-title">Update alert</h2>
        <p>Assignments and decisions are retained in the audit history.</p>
      </div>
      <div className="workflow-actions">
        <button
          className="button button-secondary"
          onClick={() => setAction("assign")}
          type="button"
        >
          Assign
        </button>
        <button
          className="button button-secondary"
          onClick={() => setAction("resolve")}
          type="button"
        >
          Resolve
        </button>
        <button
          className="button button-secondary"
          onClick={() => setAction("dismiss")}
          type="button"
        >
          Dismiss
        </button>
      </div>
      {action === null ? null : (
        <AlertWorkflowDialog
          action={action}
          alertId={alert.id}
          onClose={() => setAction(null)}
          onComplete={onComplete}
        />
      )}
    </section>
  );
}
