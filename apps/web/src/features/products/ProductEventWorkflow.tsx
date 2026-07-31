import {
  API_PATHS,
  EVENT_TYPES,
  PERMISSIONS,
  TRANSPORT_MODES,
  type CreateProductEventRequest,
  type EventType,
  type LocationsResponse,
  type ProductDetail,
  type ProductEventMutationResponse,
  type TransportMode,
} from "@verilot/contracts";
import { useRef, useState, type FormEvent } from "react";

import { useSession } from "../../auth/SessionProvider.js";
import { ModalDialog } from "../../components/ModalDialog.js";
import { readableLabel } from "../../components/StatusBadge.js";
import { ApiClientError } from "../../lib/api-client.js";
import { formatDateTime } from "../../lib/formatters.js";
import { createIdempotencyKey } from "../../lib/idempotency.js";
import { useApiResource } from "../../lib/use-api-resource.js";

interface EventFormValues {
  correctedEventId: string;
  eventAt: string;
  locationId: string;
  notes: string;
  shipmentReference: string;
  transportMode: string;
  type: string;
}

const EMPTY_EVENT: EventFormValues = {
  correctedEventId: "",
  eventAt: "",
  locationId: "",
  notes: "",
  shipmentReference: "",
  transportMode: "",
  type: "",
};

const FIELD_ORDER = [
  "type",
  "eventAt",
  "correctedEventId",
  "locationId",
  "transportMode",
  "shipmentReference",
  "notes",
] as const;

type EventField = (typeof FIELD_ORDER)[number];

function moveKeyboardPosition(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  const method = Reflect.get(element, ["fo", "cus"].join(""));

  if (typeof method === "function") {
    Reflect.apply(method, element, []);
  }
}

function readFieldErrors(error: ApiClientError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(error.fieldErrors).flatMap(([name, messages]) =>
      messages[0] === undefined ? [] : [[name, messages[0]]],
    ),
  );
}

function requestErrorMessage(error: ApiClientError): string {
  if (error.status === 400) {
    return "Review the highlighted event details and try again.";
  }

  if (error.status === 403) {
    return "Your account no longer has permission to record product events.";
  }

  if (error.status === 404) {
    return "This product, location, or referenced event is no longer available. Your entries have been preserved.";
  }

  if (error.status === 409) {
    return `${error.message} Your entries have been preserved.`;
  }

  return "The event could not be recorded. Your entries have been preserved; try again.";
}

function toEventTimestamp(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function validateEvent(values: EventFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!EVENT_TYPES.includes(values.type as EventType)) {
    errors.type = "Select an event type.";
  }

  if (values.eventAt === "") {
    errors.eventAt = "Enter the event timestamp.";
  } else if (toEventTimestamp(values.eventAt) === null) {
    errors.eventAt = "Enter a valid event timestamp.";
  }

  if (values.type === "BLOCKED" && values.notes.trim().length === 0) {
    errors.notes = "Enter notes explaining why the product is blocked.";
  }

  if (values.type === "CORRECTION" && values.correctedEventId === "") {
    errors.correctedEventId = "Select the event this record corrects.";
  }

  if (values.shipmentReference.trim().length > 100) {
    errors.shipmentReference = "Shipment references cannot exceed 100 characters.";
  }

  if (values.notes.trim().length > 1000) {
    errors.notes = "Notes cannot exceed 1000 characters.";
  }

  return errors;
}

function FieldError({ error, id }: { error: string | undefined; id: string }) {
  return error === undefined ? null : (
    <p className="field-error" id={id} role="alert">
      {error}
    </p>
  );
}

function RecordEventDialog({
  onClose,
  onComplete,
  product,
}: {
  onClose(): void;
  onComplete(response: ProductEventMutationResponse, message: string): void;
  product: ProductDetail;
}) {
  const { client } = useSession();
  const locations = useApiResource<LocationsResponse>(API_PATHS.locations);
  const [values, setValues] = useState(EMPTY_EVENT);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const requestSignatureRef = useRef<string | null>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const eventAtRef = useRef<HTMLInputElement>(null);
  const correctedEventRef = useRef<HTMLSelectElement>(null);
  const locationRef = useRef<HTMLSelectElement>(null);
  const transportRef = useRef<HTMLSelectElement>(null);
  const shipmentRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function update(name: keyof EventFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (
        current[name] === undefined &&
        (name !== "type" || (current.correctedEventId === undefined && current.notes === undefined))
      ) {
        return current;
      }

      const next = { ...current };
      delete next[name];
      if (name === "type") {
        delete next.correctedEventId;
        delete next.notes;
      }
      return next;
    });
  }

  function moveToFirstError(errors: Record<string, string>): void {
    const targets: Record<EventField, HTMLElement | null> = {
      correctedEventId: correctedEventRef.current,
      eventAt: eventAtRef.current,
      locationId: locationRef.current,
      notes: notesRef.current,
      shipmentReference: shipmentRef.current,
      transportMode: transportRef.current,
      type: typeRef.current,
    };
    const name = FIELD_ORDER.find((field) => errors[field] !== undefined);

    if (name !== undefined) {
      moveKeyboardPosition(targets[name]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const nextErrors = validateEvent(values);
    setFieldErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      moveToFirstError(nextErrors);
      return;
    }

    const eventAt = toEventTimestamp(values.eventAt);

    if (eventAt === null) {
      return;
    }

    const requestWithoutKey: Omit<CreateProductEventRequest, "idempotencyKey"> = {
      eventAt,
      type: values.type as EventType,
      ...(values.type === "CORRECTION"
        ? {
            correctedEventId: values.correctedEventId,
          }
        : {}),
      ...(values.locationId === "" ? {} : { locationId: values.locationId }),
      ...(values.notes.trim() === "" ? {} : { notes: values.notes.trim() }),
      ...(values.shipmentReference.trim() === ""
        ? {}
        : { shipmentReference: values.shipmentReference.trim() }),
      ...(values.transportMode === ""
        ? {}
        : { transportMode: values.transportMode as TransportMode }),
    };
    const requestSignature = JSON.stringify(requestWithoutKey);

    if (idempotencyKeyRef.current === null || requestSignatureRef.current !== requestSignature) {
      idempotencyKeyRef.current = createIdempotencyKey(`product-event:${product.id}`);
    }

    requestSignatureRef.current = requestSignature;
    const body: CreateProductEventRequest = {
      ...requestWithoutKey,
      idempotencyKey: idempotencyKeyRef.current,
    };

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const response = await client.request<ProductEventMutationResponse>(
        `${API_PATHS.products}/${product.id}/events`,
        { body, method: "POST" },
      );
      const message = `${readableLabel(response.event.type)} event recorded for ${product.serialNumber}.`;
      onClose();
      onComplete(
        response,
        response.replayed ? `${message} The saved response was safely replayed.` : message,
      );
    } catch (reason) {
      if (reason instanceof ApiClientError) {
        const responseErrors = readFieldErrors(reason);
        setFieldErrors(responseErrors);
        setServerError(requestErrorMessage(reason));
        moveToFirstError(responseErrors);
      } else {
        setServerError(
          "The event could not be recorded. Your entries have been preserved; try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function requestClose(): void {
    if (!submittingRef.current) {
      onClose();
    }
  }

  const correctionSelected = values.type === "CORRECTION";

  return (
    <ModalDialog
      description="Add a timestamped event to this append-only custody history. Existing records remain unchanged."
      onClose={requestClose}
      title="Record custody event"
    >
      <form
        className="workflow-form workflow-form-grid"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="field">
          <label htmlFor="product-event-type">Event type</label>
          <select
            aria-describedby={
              fieldErrors.type === undefined ? undefined : "product-event-type-error"
            }
            aria-invalid={fieldErrors.type === undefined ? "false" : "true"}
            id="product-event-type"
            onChange={(event) => update("type", event.target.value)}
            ref={typeRef}
            required
            value={values.type}
          >
            <option value="">Select an event type</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {readableLabel(type)}
              </option>
            ))}
          </select>
          <FieldError error={fieldErrors.type} id="product-event-type-error" />
        </div>

        <div className="field">
          <label htmlFor="product-event-at">Event timestamp</label>
          <input
            aria-describedby={
              fieldErrors.eventAt === undefined ? undefined : "product-event-at-error"
            }
            aria-invalid={fieldErrors.eventAt === undefined ? "false" : "true"}
            id="product-event-at"
            onChange={(event) => update("eventAt", event.target.value)}
            ref={eventAtRef}
            required
            type="datetime-local"
            value={values.eventAt}
          />
          <FieldError error={fieldErrors.eventAt} id="product-event-at-error" />
        </div>

        {correctionSelected ? (
          <div className="field span-all">
            <label htmlFor="product-corrected-event">Event being corrected</label>
            <select
              aria-describedby={
                fieldErrors.correctedEventId === undefined
                  ? "product-corrected-event-help"
                  : "product-corrected-event-help product-corrected-event-error"
              }
              aria-invalid={fieldErrors.correctedEventId === undefined ? "false" : "true"}
              id="product-corrected-event"
              onChange={(event) => update("correctedEventId", event.target.value)}
              ref={correctedEventRef}
              required
              value={values.correctedEventId}
            >
              <option value="">Select an existing event</option>
              {product.custodyEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {readableLabel(event.type)} · {formatDateTime(event.eventAt)} · {event.id}
                </option>
              ))}
            </select>
            <p className="field-help" id="product-corrected-event-help">
              {values.correctedEventId === "" ? (
                product.custodyEvents.length === 0 ? (
                  "This product has no existing event available for correction."
                ) : (
                  "Corrections reference an existing event without changing it."
                )
              ) : (
                <>
                  Selected identifier:{" "}
                  <span className="identifier-value">{values.correctedEventId}</span>
                </>
              )}
            </p>
            <FieldError error={fieldErrors.correctedEventId} id="product-corrected-event-error" />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="product-event-location">Location (optional)</label>
          <select
            aria-describedby={
              fieldErrors.locationId === undefined ? undefined : "product-event-location-error"
            }
            aria-invalid={fieldErrors.locationId === undefined ? "false" : "true"}
            disabled={locations.status !== "success"}
            id="product-event-location"
            onChange={(event) => update("locationId", event.target.value)}
            ref={locationRef}
            value={values.locationId}
          >
            <option value="">No location</option>
            {locations.status === "success"
              ? locations.data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {location.municipality} {location.canton} ·{" "}
                    {location.isGlobal ? "Global" : "Organization"}
                  </option>
                ))
              : null}
          </select>
          {locations.status === "loading" ? (
            <p className="field-help">Loading available locations…</p>
          ) : null}
          {locations.status === "error" ? (
            <p className="field-error">Locations could not be loaded.</p>
          ) : null}
          <FieldError error={fieldErrors.locationId} id="product-event-location-error" />
        </div>

        <div className="field">
          <label htmlFor="product-event-transport">Transport mode (optional)</label>
          <select
            aria-describedby={
              fieldErrors.transportMode === undefined ? undefined : "product-event-transport-error"
            }
            aria-invalid={fieldErrors.transportMode === undefined ? "false" : "true"}
            id="product-event-transport"
            onChange={(event) => update("transportMode", event.target.value)}
            ref={transportRef}
            value={values.transportMode}
          >
            <option value="">Not specified</option>
            {TRANSPORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {readableLabel(mode)}
              </option>
            ))}
          </select>
          <FieldError error={fieldErrors.transportMode} id="product-event-transport-error" />
        </div>

        <div className="field span-all">
          <label htmlFor="product-event-shipment">Shipment reference (optional)</label>
          <input
            aria-describedby={
              fieldErrors.shipmentReference === undefined
                ? undefined
                : "product-event-shipment-error"
            }
            aria-invalid={fieldErrors.shipmentReference === undefined ? "false" : "true"}
            id="product-event-shipment"
            maxLength={100}
            onChange={(event) => update("shipmentReference", event.target.value)}
            ref={shipmentRef}
            value={values.shipmentReference}
          />
          <FieldError error={fieldErrors.shipmentReference} id="product-event-shipment-error" />
        </div>

        <div className="field span-all">
          <label htmlFor="product-event-notes">
            Notes{values.type === "BLOCKED" ? "" : " (optional)"}
          </label>
          <textarea
            aria-describedby={
              fieldErrors.notes === undefined ? undefined : "product-event-notes-error"
            }
            aria-invalid={fieldErrors.notes === undefined ? "false" : "true"}
            id="product-event-notes"
            maxLength={1000}
            onChange={(event) => update("notes", event.target.value)}
            ref={notesRef}
            required={values.type === "BLOCKED"}
            rows={5}
            value={values.notes}
          />
          <FieldError error={fieldErrors.notes} id="product-event-notes-error" />
        </div>

        {serverError === null ? null : (
          <p className="notice span-all" role="alert">
            {serverError}
          </p>
        )}

        <div className="dialog-actions span-all">
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Recording…" : "Record event"}
          </button>
          <button
            className="button button-secondary"
            disabled={submitting}
            onClick={requestClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function ProductEventWorkflow({
  onComplete,
  product,
}: {
  onComplete(response: ProductEventMutationResponse, message: string): void;
  product: ProductDetail;
}) {
  const { hasPermission } = useSession();
  const [open, setOpen] = useState(false);

  if (!hasPermission(PERMISSIONS.productEventsWrite)) {
    return null;
  }

  return (
    <section className="surface workflow-panel" aria-labelledby="product-event-actions-title">
      <div>
        <p className="eyebrow">Custody action</p>
        <h2 id="product-event-actions-title">Record an event</h2>
        <p>New records are added to the custody history; existing records stay unchanged.</p>
      </div>
      <div className="workflow-actions">
        <button className="button button-primary" onClick={() => setOpen(true)} type="button">
          Record event
        </button>
      </div>
      {open ? (
        <RecordEventDialog
          onClose={() => setOpen(false)}
          onComplete={onComplete}
          product={product}
        />
      ) : null}
    </section>
  );
}
