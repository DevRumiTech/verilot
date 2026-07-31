import {
  API_PATHS,
  BATCH_STATUSES,
  type BatchDetailResponse,
  type BatchesResponse,
} from "@verilot/contracts";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DetailList } from "../../components/DetailList.js";
import { buildListPath, ListControls, Pagination } from "../../components/ListControls.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDate, formatDateTime } from "../../lib/formatters.js";
import { useApiResource } from "../../lib/use-api-resource.js";

export function BatchListPage() {
  const [parameters] = useSearchParams();
  const path = buildListPath(API_PATHS.batches, parameters, BATCH_STATUSES);
  const resource = useApiResource<BatchesResponse>(path);

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Manufacturing lots</p>
        <h1 id="page-title">Batches</h1>
        <p>Review lot ranges, lifecycle status, serialized products, and recall coverage.</p>
      </header>
      <ListControls searchLabel="Search code, lot, product, or SKU" statuses={BATCH_STATUSES} />

      {resource.status === "loading" ? <LoadingState label="Loading batches…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.batches.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No batches found">
              Adjust the current filters or search text and try again.
            </EmptyState>
          </section>
        ) : (
          <>
            <div className="surface table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">Batches matching the current filters</caption>
                <thead>
                  <tr>
                    <th scope="col">Batch code</th>
                    <th scope="col">Product</th>
                    <th scope="col">Lot number</th>
                    <th scope="col">Status</th>
                    <th scope="col">Products</th>
                    <th scope="col">Manufactured</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.batches.map((batch) => (
                    <tr key={batch.id}>
                      <td data-label="Batch code">
                        <Link to={`/batches/${batch.id}`}>{batch.code}</Link>
                      </td>
                      <td data-label="Product">{batch.productName}</td>
                      <td data-label="Lot number">{batch.lotNumber}</td>
                      <td data-label="Status">
                        <StatusBadge value={batch.status} />
                      </td>
                      <td data-label="Products">{batch.productCount.toLocaleString("en-CH")}</td>
                      <td data-label="Manufactured">{formatDate(batch.manufacturedAt)}</td>
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

export function BatchDetailPage() {
  const { batchId = "" } = useParams();
  const resource = useApiResource<BatchDetailResponse>(`${API_PATHS.batches}/${batchId}`);

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header detail-page-header">
        <div>
          <p className="eyebrow">Batch detail</p>
          <h1 id="page-title">Manufacturing lot</h1>
        </div>
        <Link className="button button-secondary" to="/batches">
          Back to batches
        </Link>
      </header>
      {resource.status === "loading" ? <LoadingState label="Loading batch…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        <section className="surface detail-card" aria-labelledby="batch-overview-title">
          <div className="detail-heading">
            <div>
              <p className="eyebrow">{resource.data.batch.productName}</p>
              <h2 id="batch-overview-title">{resource.data.batch.code}</h2>
            </div>
            <StatusBadge value={resource.data.batch.status} />
          </div>
          <DetailList
            items={[
              { label: "Product", value: resource.data.batch.productName },
              { label: "SKU", value: resource.data.batch.sku },
              { label: "Lot number", value: resource.data.batch.lotNumber },
              { label: "Manufactured", value: formatDate(resource.data.batch.manufacturedAt) },
              {
                label: "Expires",
                value:
                  resource.data.batch.expiresAt === null
                    ? "No expiry recorded"
                    : formatDate(resource.data.batch.expiresAt),
              },
              {
                label: "Activated",
                value:
                  resource.data.batch.activatedAt === null
                    ? "Not activated"
                    : formatDateTime(resource.data.batch.activatedAt),
              },
              {
                label: "Serial range",
                value: `${resource.data.batch.serialPrefix}${resource.data.batch.serialStart} – ${resource.data.batch.serialPrefix}${resource.data.batch.serialEnd}`,
              },
              {
                label: "Products",
                value: (
                  <Link to={`/products?batchId=${encodeURIComponent(resource.data.batch.id)}`}>
                    {resource.data.batch.productCount.toLocaleString("en-CH")} serialized products
                  </Link>
                ),
              },
              { label: "Recalls", value: resource.data.batch.recallCount.toLocaleString("en-CH") },
            ]}
          />
        </section>
      ) : null}
    </section>
  );
}
