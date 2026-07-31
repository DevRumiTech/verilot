import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";

const createdLocationIds: string[] = [];
let authenticatedCookie = "";
let foreignLocationId = "";
let globalLocationId = "";
let ownLocationId = "";
let searchValue = "";

function readCookiePair(response: request.Response): string {
  const values = response.headers["set-cookie"];

  if (!Array.isArray(values) || values[0] === undefined) {
    throw new Error("Expected a Set-Cookie response header.");
  }

  const cookiePair = values[0].split(";")[0];

  if (cookiePair === undefined) {
    throw new Error("Expected an authentication cookie.");
  }

  return cookiePair;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({
      email,
      password,
    })
    .expect(200);

  return readCookiePair(response);
}

beforeAll(async () => {
  const [manufacturer, foreignOrganization] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: "verilot-manufacturing",
      },
    }),
    prisma.organization.findFirstOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: {
          not: "verilot-manufacturing",
        },
      },
    }),
  ]);

  searchValue = randomUUID().slice(0, 8);

  const [ownLocation, globalLocation, foreignLocation] = await Promise.all([
    prisma.location.create({
      data: {
        canton: "JU",
        code: `LOC-OWN-${searchValue}`,
        countryCode: "CH",
        isKnown: true,
        latitude: 47.36,
        longitude: 7.35,
        municipality: "Delémont",
        name: `Owned Site ${searchValue}`,
        organizationId: manufacturer.id,
      },
      select: {
        id: true,
      },
    }),
    prisma.location.create({
      data: {
        canton: "FR",
        code: `LOC-GLOBAL-${searchValue}`,
        countryCode: "CH",
        isKnown: true,
        latitude: 46.81,
        longitude: 7.15,
        municipality: "Fribourg",
        name: `Global Site ${searchValue}`,
        organizationId: null,
      },
      select: {
        id: true,
      },
    }),
    prisma.location.create({
      data: {
        canton: "ZG",
        code: `LOC-FOREIGN-${searchValue}`,
        countryCode: "CH",
        isKnown: true,
        latitude: 47.17,
        longitude: 8.52,
        municipality: "Zug",
        name: `Foreign Site ${searchValue}`,
        organizationId: foreignOrganization.id,
      },
      select: {
        id: true,
      },
    }),
  ]);

  ownLocationId = ownLocation.id;
  globalLocationId = globalLocation.id;
  foreignLocationId = foreignLocation.id;

  createdLocationIds.push(ownLocationId, globalLocationId, foreignLocationId);
  authenticatedCookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");
});

afterAll(async () => {
  if (createdLocationIds.length > 0) {
    await prisma.location.deleteMany({
      where: {
        id: {
          in: createdLocationIds,
        },
      },
    });
  }

  await prisma.$disconnect();
});

describe("location API", () => {
  it("rejects anonymous requests", async () => {
    await request(app).get(API_PATHS.locations).expect(401);
  });

  it("returns organization and global locations", async () => {
    const response = await request(app)
      .get(API_PATHS.locations)
      .query({
        search: searchValue,
      })
      .set("Cookie", authenticatedCookie)
      .expect(200);

    const locations = response.body.data.locations;
    const ids = locations.map((location: { id: string }) => location.id);

    expect(ids).toContain(ownLocationId);
    expect(ids).toContain(globalLocationId);
    expect(ids).not.toContain(foreignLocationId);

    expect(
      locations.find((location: { id: string }) => location.id === globalLocationId),
    ).toMatchObject({
      isGlobal: true,
    });

    expect(
      locations.find((location: { id: string }) => location.id === ownLocationId),
    ).toMatchObject({
      isGlobal: false,
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
  });

  it("filters by canton", async () => {
    const response = await request(app)
      .get(API_PATHS.locations)
      .query({
        canton: "fr",
        search: searchValue,
      })
      .set("Cookie", authenticatedCookie)
      .expect(200);

    expect(response.body.data.locations).toHaveLength(1);
    expect(response.body.data.locations[0]).toMatchObject({
      canton: "FR",
      id: globalLocationId,
      isGlobal: true,
    });
  });
});
