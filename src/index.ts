import { Client, ClientConfig } from 'pg';
import { Region, Connection, Location, LocationSpec, DatabaseNode, Env } from './interfaces';

function radians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function haversineDistance(a: Location, b: Location): number {
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

function getClosestNode(nodes: DatabaseNode[], location: Location): DatabaseNode {
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

function getClientConfig(node: DatabaseNode, opts?: ClientConfig): ClientConfig {
  const conn = node.connection;
  return {
    ...(opts || {}),
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

export interface BaseConnectOptions {
  location?: LocationSpec;
  request?: any;
}

export interface EnvironmentConnectOptions extends BaseConnectOptions {
  env: Env;
}

export interface NodesConnectOptions extends BaseConnectOptions {
  nodes: DatabaseNode[];
}

export type ConnectOptions = EnvironmentConnectOptions | NodesConnectOptions;

async function connect(opts: ConnectOptions): Promise<Client> {
  let nodes: DatabaseNode[] = [];
  if ('env' in opts) {
    nodes = getNodes(opts.env);
  } else if ('nodes' in opts) {
    nodes = opts.nodes;
  } else {
    throw new Error('invalid options: env or nodes must be provided');
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('invalid options: at least one node must be provided');
  }
  // 38.88, -77.04 is Washington, DC, i.e. default to the us-east-1 area
  let latitude = 38.88;
  let longitude = -77.04;
  if (opts.location) {
    latitude = getNumber(opts.location.latitude, 38.88);
    longitude = getNumber(opts.location.longitude, -77.04);
  } else if (opts.request?.cf) {
    latitude = getNumber(opts.request.cf.latitude, 38.88);
    longitude = getNumber(opts.request.cf.longitude, -77.04);
  }
  const node = getClosestNode(nodes, { latitude, longitude });
  const config = getClientConfig(node);
  const client = new Client(config);
  await client.connect();
  return client;
}

export {
  connect,
  getNodes,
  getClosestNode,
  getClientConfig,
  haversineDistance,
  Region,
  Connection,
  Location,
  LocationSpec,
  DatabaseNode,
  Env,
};
