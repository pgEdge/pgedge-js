import { Client, ClientConfig } from 'pg';
import { DatabaseNode, Location, Request, Env } from './interfaces';

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
  for (let node of nodes.slice(1)) {
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

async function connect(request: Request, env: Env): Promise<Client> {
  const nodes = getNodes(env);
  var node = nodes[0];
  if (request.cf && request.cf.latitude && request.cf.longitude) {
    node = getClosestNode(nodes, {
      latitude: parseFloat(request.cf.latitude as string),
      longitude: parseFloat(request.cf.longitude as string),
    });
  }
  const config = getClientConfig(node);
  const client = new Client(config);
  await client.connect();
  return client;
}

export { connect, getNodes, getClosestNode, getClientConfig, haversineDistance };
