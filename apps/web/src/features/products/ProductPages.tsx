import {
  API_PATHS,
  PRODUCT_STATUSES,
  type ProductDetail,
  type ProductDetailResponse,
  type ProductEventMutationResponse,
  type ProductsResponse,
} from "@verilot/contracts";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DetailList } from "../../components/DetailList.js";
import { buildListPath, ListControls, Pagination } from "../../components/ListControls.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { readableLabel, StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/formatters.js";
import { useApiResource } from "../../lib/use-api-resource.js";
import { ProductEventWorkflow } from "./ProductEventWorkflow.js";

export function ProductListPage() {
  const [parameters] = useSearchParams();
  const path = buildListPath(API_PATHS.products, parameters, PRODUCT_STATUSES, true);
  const resource = useApiResource<ProductsResponse>(path);

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Serialized inventory</p>
        <h1 id="page-title">Products</h1>
        <p>Search product identifiers and review current status and custody coverage.</p>
      </header>

      <ListControls searchLabel="Search serial number or batch" statuses={PRODUCT_STATUSES} />
      {parameters.has("batchId") ? (
        <p className="filter-note" role="status">
          A batch filter is applied. Clear filters to review all products.
        </p>
      ) : null}

      {resource.status === "loading" ? <LoadingState label="Loading products…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.products.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No products found">
              Adjust the current filters or search text and try again.
            </EmptyState>
          </section>
        ) : (
          <>
            <div className="surface table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">Products matching the current filters</caption>
                <thead>
                  <tr>
                    <th scope="col">Serial number</th>
                    <th scope="col">Product</th>
                    <th scope="col">Batch</th>
                    <th scope="col">Status</th>
                    <th scope="col">Custody records</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.products.map((product) => (
                    <tr key={product.id}>
                      <th data-label="Serial number" scope="row">
                        <Link to={`/products/${product.id}`}>{product.serialNumber}</Link>
                      </th>
                      <td data-label="Product">{product.batch.productName}</td>
                      <td data-label="Batch">
                        <Link to={`/batches/${product.batch.id}`}>{product.batch.code}</Link>
                      </td>
                      <td data-label="Status">
                        <StatusBadge value={product.status} />
                      </td>
                      <td data-label="Custody records">
                        {product.eventCount.toLocaleString("en-CH")}
                      </td>
                      <td data-label="Updated">{formatDateTime(product.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...resource.data.pagination} />
          </>
        )
      ) : null}
    </section>
  );
}

function ProductDetailContent({
  onEventComplete,
  product,
}: {
  onEventComplete(response: ProductEventMutationResponse, message: string): void;
  product: ProductDetail;
}) {
  return (
    <>
      <section className="surface detail-card" aria-labelledby="product-overview-title">
        <div className="detail-heading">
          <div>
            <p className="eyebrow">Product record</p>
            <h2 id="product-overview-title">{product.serialNumber}</h2>
          </div>
          <StatusBadge value={product.status} />
        </div>
        <DetailList
          items={[
            { label: "Product", value: product.batch.productName },
            { label: "SKU", value: product.batch.sku },
            {
              label: "Batch",
              value: <Link to={`/batches/${product.batch.id}`}>{product.batch.code}</Link>,
            },
            { label: "Lot number", value: product.batch.lotNumber },
            {
              label: "Activated",
              value:
                product.activatedAt === null
                  ? "Not activated"
                  : formatDateTime(product.activatedAt),
            },
            { label: "Updated", value: formatDateTime(product.updatedAt) },
            { label: "Custody records", value: product.eventCount.toLocaleString("en-CH") },
            { label: "Block reason", value: product.blockReason ?? "Not blocked" },
          ]}
        />
      </section>

      <ProductEventWorkflow onComplete={onEventComplete} product={product} />

      <section className="surface panel detail-section" aria-labelledby="custody-history-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Append-only record</p>
            <h2 id="custody-history-title">Custody history</h2>
          </div>
        </div>
        {product.custodyEvents.length === 0 ? (
          <EmptyState title="No custody records">
            This product has no recorded custody events.
          </EmptyState>
        ) : (
          <ol className="timeline">
            {product.custodyEvents.map((event) => (
              <li key={event.id}>
                <div className="timeline-marker" aria-hidden="true" />
                <article>
                  <div className="timeline-heading">
                    <h3>{readableLabel(event.type)}</h3>
                    <time dateTime={event.eventAt}>{formatDateTime(event.eventAt)}</time>
                  </div>
                  <p>
                    {event.organization.name} ·{" "}
                    {event.location === null
                      ? "Location unavailable"
                      : `${event.location.name}, ${event.location.municipality} ${event.location.canton}`}
                  </p>
                  <dl className="event-meta">
                    <div>
                      <dt>Recorded</dt>
                      <dd>{formatDateTime(event.recordedAt)}</dd>
                    </div>
                    <div>
                      <dt>Actor</dt>
                      <dd>{event.actor?.displayName ?? "System record"}</dd>
                    </div>
                    <div>
                      <dt>Transport</dt>
                      <dd>
                        {event.transportMode === null
                          ? "Not specified"
                          : readableLabel(event.transportMode)}
                      </dd>
                    </div>
                    <div>
                      <dt>Shipment</dt>
                      <dd>{event.shipmentReference ?? "Not specified"}</dd>
                    </div>
                  </dl>
                  {event.notes === null ? null : <p className="event-notes">{event.notes}</p>}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const resource = useApiResource<ProductDetailResponse>(`${API_PATHS.products}/${productId}`);
  const [updatedProduct, setUpdatedProduct] = useState<ProductDetail | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setUpdatedProduct(null);
    setSuccessMessage(null);
  }, [productId]);

  function eventCompleted(response: ProductEventMutationResponse, message: string): void {
    if (resource.status !== "success") {
      return;
    }

    setUpdatedProduct((current) => {
      const product = current ?? resource.data.product;
      const hasEvent = product.custodyEvents.some((event) => event.id === response.event.id);
      const custodyEvents = hasEvent
        ? product.custodyEvents
        : [...product.custodyEvents, response.event].sort((left, right) => {
            const eventOrder = left.eventAt.localeCompare(right.eventAt);
            return eventOrder === 0 ? left.recordedAt.localeCompare(right.recordedAt) : eventOrder;
          });

      return {
        ...product,
        custodyEvents,
        eventCount: hasEvent ? product.eventCount : product.eventCount + 1,
        status: response.productStatus,
      };
    });
    setSuccessMessage(message);
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header detail-page-header">
        <div>
          <p className="eyebrow">Product detail</p>
          <h1 id="page-title">Traceability record</h1>
        </div>
        <Link className="button button-secondary" to="/products">
          Back to products
        </Link>
      </header>
      {resource.status === "loading" ? <LoadingState label="Loading product…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {successMessage === null ? null : (
        <p className="notice success-notice" role="status">
          {successMessage}
        </p>
      )}
      {resource.status === "success" ? (
        <ProductDetailContent
          onEventComplete={eventCompleted}
          product={updatedProduct ?? resource.data.product}
        />
      ) : null}
    </section>
  );
}
