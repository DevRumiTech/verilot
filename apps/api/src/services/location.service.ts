import type { AuthSessionResponse, LocationSummary, LocationsResponse } from "@verilot/contracts";

import {
  locationRepository,
  type LocationRecord,
  type LocationRepository,
} from "../repositories/location.repository.js";

export interface ListLocationsServiceInput {
  canton?: string;
  search?: string;
}

function toLocationSummary(location: LocationRecord): LocationSummary {
  return {
    canton: location.canton,
    code: location.code,
    countryCode: location.countryCode,
    id: location.id,
    isGlobal: location.organizationId === null,
    latitude: location.latitude.toNumber(),
    longitude: location.longitude.toNumber(),
    municipality: location.municipality,
    name: location.name,
  };
}

export class LocationService {
  public constructor(private readonly repository: LocationRepository) {}

  public async listLocations(
    session: AuthSessionResponse,
    input: ListLocationsServiceInput,
  ): Promise<LocationsResponse> {
    const locations = await this.repository.list({
      organizationId: session.user.organization.id,
      ...(input.canton === undefined
        ? {}
        : {
            canton: input.canton,
          }),
      ...(input.search === undefined
        ? {}
        : {
            search: input.search,
          }),
    });

    return {
      locations: locations.map(toLocationSummary),
    };
  }
}

export const locationService = new LocationService(locationRepository);
