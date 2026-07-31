export interface LocationSummary {
  canton: string;
  code: string;
  countryCode: string;
  id: string;
  isGlobal: boolean;
  latitude: number;
  longitude: number;
  municipality: string;
  name: string;
}

export interface LocationsResponse {
  locations: readonly LocationSummary[];
}
