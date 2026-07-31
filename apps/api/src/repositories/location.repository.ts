import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const locationSelect = {
  canton: true,
  code: true,
  countryCode: true,
  id: true,
  latitude: true,
  longitude: true,
  municipality: true,
  name: true,
  organizationId: true,
} satisfies Prisma.LocationSelect;

export type LocationRecord = Prisma.LocationGetPayload<{
  select: typeof locationSelect;
}>;

export interface ListLocationsInput {
  canton?: string;
  organizationId: string;
  search?: string;
}

export interface LocationRepository {
  list(input: ListLocationsInput): Promise<readonly LocationRecord[]>;
}

function buildWhere(input: ListLocationsInput): Prisma.LocationWhereInput {
  const search = input.search?.trim();

  return {
    isKnown: true,
    OR: [
      {
        organizationId: input.organizationId,
      },
      {
        organizationId: null,
      },
    ],
    ...(input.canton === undefined
      ? {}
      : {
          canton: input.canton,
        }),
    ...(search === undefined || search === ""
      ? {}
      : {
          AND: [
            {
              OR: [
                {
                  code: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  municipality: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              ],
            },
          ],
        }),
  };
}

export const locationRepository: LocationRepository = {
  async list(input) {
    return prisma.location.findMany({
      orderBy: [
        {
          canton: "asc",
        },
        {
          municipality: "asc",
        },
        {
          name: "asc",
        },
        {
          code: "asc",
        },
        {
          id: "asc",
        },
      ],
      select: locationSelect,
      where: buildWhere(input),
    });
  },
};
