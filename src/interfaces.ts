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

interface LocationSpec {
  latitude: number | string;
  longitude: number | string;
}

interface Location {
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
  location: Location;
}

interface Env {
  PGEDGE_NODES: string;
}

interface Request {
  cf?: {
    latitude?: string;
    longitude?: string;
  };
}

export { Region, Connection, Location, LocationSpec, DatabaseNode, Env, Request };
