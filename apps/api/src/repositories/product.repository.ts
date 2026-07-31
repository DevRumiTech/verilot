import type { ProductStatus } from "@verilot/contracts";
import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const productSummarySelect = {
  _count: {
    select: {
      custodyEvents: true,
    },
  },
  activatedAt: true,
  batch: {
    select: {
      code: true,
      id: true,
      lotNumber: true,
      productName: true,
      sku: true,
      status: true,
    },
  },
  blockedAt: true,
  blockReason: true,
  id: true,
  serialNumber: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...productSummarySelect,
  custodyEvents: {
    orderBy: [
      {
        eventAt: "asc",
      },
      {
        recordedAt: "asc",
      },
    ],
    select: {
      actor: {
        select: {
          displayName: true,
        },
      },
      eventAt: true,
      id: true,
      location: {
        select: {
          canton: true,
          countryCode: true,
          municipality: true,
          name: true,
        },
      },
      notes: true,
      organization: {
        select: {
          name: true,
          type: true,
        },
      },
      recordedAt: true,
      shipmentReference: true,
      transportMode: true,
      type: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductSummaryRecord = Prisma.ProductGetPayload<{
  select: typeof productSummarySelect;
}>;

export type ProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof productDetailSelect;
}>;

export interface ListProductsInput {
  batchId?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: ProductStatus;
}

export interface ListProductsResult {
  products: readonly ProductSummaryRecord[];
  totalItems: number;
}

export interface ProductRepository {
  findByIdAndOrganization(
    productId: string,
    organizationId: string,
  ): Promise<ProductDetailRecord | null>;
  list(input: ListProductsInput): Promise<ListProductsResult>;
}

function buildWhere(input: ListProductsInput): Prisma.ProductWhereInput {
  const search = input.search?.trim();

  return {
    batch: {
      manufacturerOrganizationId: input.organizationId,
    },
    ...(input.batchId === undefined
      ? {}
      : {
          batchId: input.batchId,
        }),
    ...(input.status === undefined
      ? {}
      : {
          status: input.status,
        }),
    ...(search === undefined || search === ""
      ? {}
      : {
          OR: [
            {
              serialNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              batch: {
                code: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                lotNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                productName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                sku: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }),
  };
}

export const productRepository: ProductRepository = {
  async findByIdAndOrganization(productId, organizationId) {
    return prisma.product.findFirst({
      select: productDetailSelect,
      where: {
        id: productId,
        batch: {
          manufacturerOrganizationId: organizationId,
        },
      },
    });
  },

  async list(input) {
    const where = buildWhere(input);

    const [products, totalItems] = await Promise.all([
      prisma.product.findMany({
        orderBy: [
          {
            updatedAt: "desc",
          },
          {
            serialNumber: "asc",
          },
        ],
        select: productSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
      prisma.product.count({
        where,
      }),
    ]);

    return {
      products,
      totalItems,
    };
  },
};
