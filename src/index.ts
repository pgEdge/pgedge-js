import { Client, ClientConfig } from 'pg';
import { DatabaseNode, Location, LocationSpec, Env } from './interfaces';

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

export interface BaseConnectOptions {
  location?: LocationSpec;
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
  let node = nodes[0];
  if (opts.location) {
    let latitude = 0.0;
    let longitude = 0.0;
    if (typeof opts.location.latitude === 'string') {
      latitude = parseFloat(opts.location.latitude);
    } else {
      latitude = opts.location.latitude;
    }
    if (typeof opts.location.longitude === 'string') {
      longitude = parseFloat(opts.location.longitude);
    } else {
      longitude = opts.location.longitude;
    }
    node = getClosestNode(nodes, { latitude, longitude });
  }
  const config = getClientConfig(node);
  const client = new Client(config);
  await client.connect();
  return client;
}

export { connect, getNodes, getClosestNode, getClientConfig, haversineDistance };
