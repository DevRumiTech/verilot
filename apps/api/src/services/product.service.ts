import type {
  AuthSessionResponse,
  ProductCustodyEvent,
  ProductDetail,
  ProductDetailResponse,
  ProductStatus,
  ProductSummary,
  ProductsResponse,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  productRepository,
  type ProductDetailRecord,
  type ProductRepository,
  type ProductSummaryRecord,
} from "../repositories/product.repository.js";

export interface ListProductsServiceInput {
  batchId?: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: ProductStatus;
}

function toProductSummary(product: ProductSummaryRecord): ProductSummary {
  return {
    activatedAt: product.activatedAt?.toISOString() ?? null,
    batch: {
      code: product.batch.code,
      id: product.batch.id,
      lotNumber: product.batch.lotNumber,
      productName: product.batch.productName,
      sku: product.batch.sku,
      status: product.batch.status,
    },
    blockedAt: product.blockedAt?.toISOString() ?? null,
    blockReason: product.blockReason,
    eventCount: product._count.custodyEvents,
    id: product.id,
    serialNumber: product.serialNumber,
    status: product.status,
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toCustodyEvent(event: ProductDetailRecord["custodyEvents"][number]): ProductCustodyEvent {
  return {
    actor:
      event.actor === null
        ? null
        : {
            displayName: event.actor.displayName,
          },
    eventAt: event.eventAt.toISOString(),
    id: event.id,
    location:
      event.location === null
        ? null
        : {
            canton: event.location.canton,
            countryCode: event.location.countryCode,
            municipality: event.location.municipality,
            name: event.location.name,
          },
    notes: event.notes,
    organization: {
      name: event.organization.name,
      type: event.organization.type,
    },
    recordedAt: event.recordedAt.toISOString(),
    shipmentReference: event.shipmentReference,
    transportMode: event.transportMode,
    type: event.type,
  };
}

function toProductDetail(product: ProductDetailRecord): ProductDetail {
  return {
    ...toProductSummary(product),
    custodyEvents: product.custodyEvents.map(toCustodyEvent),
  };
}

export class ProductService {
  public constructor(private readonly repository: ProductRepository) {}

  public async getProduct(
    session: AuthSessionResponse,
    productId: string,
  ): Promise<ProductDetailResponse> {
    const product = await this.repository.findByIdAndOrganization(
      productId,
      session.user.organization.id,
    );

    if (product === null) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    }

    return {
      product: toProductDetail(product),
    };
  }

  public async listProducts(
    session: AuthSessionResponse,
    input: ListProductsServiceInput,
  ): Promise<ProductsResponse> {
    const result = await this.repository.list({
      organizationId: session.user.organization.id,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.batchId === undefined
        ? {}
        : {
            batchId: input.batchId,
          }),
      ...(input.search === undefined
        ? {}
        : {
            search: input.search,
          }),
      ...(input.status === undefined
        ? {}
        : {
            status: input.status,
          }),
    });

    return {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.pageSize),
      },
      products: result.products.map(toProductSummary),
    };
  }
}

export const productService = new ProductService(productRepository);
