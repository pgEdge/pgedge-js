import { Client, ClientConfig } from 'pg';
import { Region, Connection, Geolocation, GeolocationSpec, DatabaseNode, Env } from './interfaces';

function radians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function haversineDistance(a: Geolocation, b: Geolocation): number {
  const r = 6371.0; // radius of the earth in km
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const d = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
  return r * c;
}

function getNodes(env: Env): DatabaseNode[] {
  if (!env.PGEDGE_NODES) {
    throw new Error('PGEDGE_NODES is not set');
  }
  const nodes = JSON.parse(env.PGEDGE_NODES);
  if (!Array.isArray(nodes)) {
    throw new Error('PGEDGE_NODES is not an array');
  }
  if (nodes.length === 0) {
    throw new Error('PGEDGE_NODES array is empty');
  }
  return nodes;
}

function getClosestNode(nodes: DatabaseNode[], location: Geolocation): DatabaseNode {
  if (nodes.length === 0) {
    throw new Error('No nodes provided');
  }
  let closestNode: DatabaseNode = nodes[0];
  let closestDistance = haversineDistance(location, closestNode.location);
  for (const node of nodes.slice(1)) {
    const distance = haversineDistance(location, node.location);
    if (distance < closestDistance) {
      closestNode = node;
      closestDistance = distance;
    }
  }
  return closestNode;
}

function getClientConfig(node: DatabaseNode, config?: ClientConfig): ClientConfig {
  const conn = node.connection;
  return {
    ...(config || {}),
    host: conn.host,
    port: conn.port,
    user: conn.username,
    password: conn.password,
    database: conn.database,
  };
}

function getNumber(value: number | string | undefined | unknown, defaultValue: number): number {
  if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return parseFloat(value);
  }
  return defaultValue;
}

// 38.88, -77.04 is Washington, DC, i.e. default to the us-east-1 area
const defaultLocation: Geolocation = {
  latitude: 38.88,
  longitude: -77.04,
};

interface BaseConnectOptions {
  // Geolocation of the client that is connecting.
  location?: GeolocationSpec;

  // The request that is being handled.
  request?: any;

  // Additional configuration passed to the Postgres client.
  config?: ClientConfig;

  // Determines whether a select latency measurement will be taken.
  // If set to a number between 0 and 1, the measurement will be taken
  // for that percentage of requests. If set to one or greater, a measurement
  // will be taken on every request. If set to zero or less, no measurement
  // will be taken.
  measureLatency?: number;
}

// Builds an object containing location information for the given request.
function getLocationData(latitude: number, longitude: number, request: any): Record<string, any> {
  const data: Record<string, any> = { latitude, longitude };
  if (request && request.cf) {
    data.code = request.cf.colo;
    data.country = request.cf.country;
    data.is_eu_country = request.cf.isEUCountry;
    data.city = request.cf.city;
    data.metro_code = request.cf.metroCode;
    data.postal_code = request.cf.postalCode;
    data.region = request.cf.region;
    data.region_code = request.cf.regionCode;
  }
  return data;
}

// Determine where latency measurements should be sent, if at all.
function getLatencyMeasurementEndpoint(env: Env): string {
  if (env.PGEDGE_LATENCY_MEASUREMENT_ENDPOINT) {
    return env.PGEDGE_LATENCY_MEASUREMENT_ENDPOINT;
  } else if (env.PGEDGE_CLUSTER_ID) {
    return `https://api.pgedge.com/clusters/${env.PGEDGE_CLUSTER_ID}/views/latency-measurements`;
  }
  return '';
}

async function sendLatencyMeasurement(
  endpoint: string,
  client: Client,
  node: DatabaseNode,
  locData: Record<string, any>,
  meta: Record<string, any>,
) {
  const startDate = new Date();
  const start = startDate.getTime();
  const query = 'SELECT NOW()';
  const result = await client.query(query);
  const end = Date.now();
  const latency = (end - start) / 1000;
  meta.query = query;
  meta.result = null;
  if (result.rows.length === 1) {
    meta.result = new Date(result.rows[0].now).toISOString();
  }
  await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify([
      {
        node_id: node.id,
        value: latency,
        time: startDate.toISOString(),
        location: locData,
        source: 'pgedge-js',
        meta,
      },
    ]),
  });
}

interface EnvironmentConnectOptions extends BaseConnectOptions {
  // Environment variables that contain information on database nodes
  env: Env;
}

interface NodesConnectOptions extends BaseConnectOptions {
  // Explicitly provided database node information
  nodes: DatabaseNode[];
}

// Options used when connected to a pgEdge database cluster
type ConnectOptions = EnvironmentConnectOptions | NodesConnectOptions;

async function connect(opts: ConnectOptions): Promise<Client> {
  // Retrieve information about the available database nodes
  let nodes: DatabaseNode[] = [];
  if ('env' in opts) {
    nodes = getNodes(opts.env);
  } else if ('nodes' in opts) {
    nodes = opts.nodes;
  } else {
    throw new Error('invalid options: env or nodes must be provided');
  }

  // There must be at least one node in order for us to connect
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('invalid options: at least one node must be provided');
  }

  // Determine the latitude and longitude of the client that is connecting
  let latitude: number;
  let longitude: number;
  if (opts.location) {
    latitude = getNumber(opts.location.latitude, defaultLocation.latitude);
    longitude = getNumber(opts.location.longitude, defaultLocation.longitude);
  } else if (opts.request?.cf) {
    latitude = getNumber(opts.request.cf.latitude, defaultLocation.latitude);
    longitude = getNumber(opts.request.cf.longitude, defaultLocation.longitude);
  } else {
    latitude = defaultLocation.latitude;
    longitude = defaultLocation.longitude;
  }

  // Pick the node that is closest to this client
  const node = getClosestNode(nodes, { latitude, longitude });

  // Connect to the database node
  const config = getClientConfig(node, opts.config ?? {});
  const client = new Client(config);
  await client.connect();

  // Measure latency if opted in
  if (opts.measureLatency && Math.random() < opts.measureLatency) {
    if ('env' in opts) {
      const endpoint = getLatencyMeasurementEndpoint(opts.env);
      if (endpoint) {
        const locData = getLocationData(latitude, longitude, opts.request);
        const meta: Record<string, any> = {};
        if (opts.request?.cf) {
          meta.cf_ray = opts.request.headers.get('cf-ray');
        }
        await sendLatencyMeasurement(endpoint, client, node, locData, meta);
      }
    }
  }
  return client;
}

export {
  connect,
  getNodes,
  getClosestNode,
  getClientConfig,
  haversineDistance,
  BaseConnectOptions,
  EnvironmentConnectOptions,
  NodesConnectOptions,
  ConnectOptions,
  Client,
  Region,
  Connection,
  Geolocation,
  GeolocationSpec,
  DatabaseNode,
  Env,
};
