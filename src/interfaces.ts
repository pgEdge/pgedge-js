interface Region {
  name: string;
  code: string;
  cloud: string;
  availability_zones: string[];
}

interface Connection {
  database: string;
  host: string;
  port: number;
  username: string;
  password: string;
  external_ip_address: string;
}

interface GeolocationSpec {
  latitude: number | string | undefined | unknown;
  longitude: number | string | undefined | unknown;
}

interface Geolocation {
  latitude: number;
  longitude: number;
}

interface DatabaseNode {
  id: string;
  name: string;
  pg_version: string;
  is_active: boolean;
  availability_zone: string;
  region: string;
  region_detail: Region;
  public_ip_address: string;
  connection: Connection;
  location: Geolocation;
}

interface Env {
  PGEDGE_NODES: string;
}

export { Region, Connection, Geolocation, GeolocationSpec, DatabaseNode, Env };
