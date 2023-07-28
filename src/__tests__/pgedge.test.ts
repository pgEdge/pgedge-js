import { Client } from 'pg';
import { getNodes, getClosestNode, getClientConfig, connect, Geolocation } from '../index';

// Mock pg.Client so that we don't actually connect to a database
jest.mock('pg', () => {
  return {
    Client: jest.fn().mockImplementation((config) => {
      return {
        ...config,
        connect: function () {
          return new Promise((resolve) => {
            resolve(true);
          });
        },
      };
    }),
  };
});

const testNodes = `[
  {
    "connection": {
      "host": "h1",
      "port": 5432,
      "username": "u1",
      "password": "p1",
      "database": "d1"
    },
    "location": {
      "latitude": 5,
      "longitude": 10
    }
  },
  {
    "connection": {
      "host": "h2",
      "port": 5432,
      "username": "u2",
      "password": "p2",
      "database": "d2"
    },
    "location": {
      "latitude": 90,
      "longitude": -30
    }
  }
]`;

test('getNodes', () => {
  const env = { PGEDGE_NODES: testNodes };
  const nodes = getNodes(env);
  expect(nodes.length).toBe(2);

  expect(nodes[0].connection).toMatchObject({
    host: 'h1',
    port: 5432,
    username: 'u1',
    password: 'p1',
    database: 'd1',
  });
  expect(nodes[0].location).toMatchObject({
    latitude: 5,
    longitude: 10,
  });

  expect(nodes[1].connection).toMatchObject({
    host: 'h2',
    port: 5432,
    username: 'u2',
    password: 'p2',
    database: 'd2',
  });
  expect(nodes[1].location).toMatchObject({
    latitude: 90,
    longitude: -30,
  });
});

test('getClosestNode', () => {
  const nodes = getNodes({ PGEDGE_NODES: testNodes });
  expect(nodes.length).toBe(2);

  let closest = getClosestNode(nodes, { latitude: 0, longitude: 0 });
  expect(closest).toBe(nodes[0]);

  closest = getClosestNode(nodes, { latitude: -5, longitude: -5 });
  expect(closest).toBe(nodes[0]);

  closest = getClosestNode(nodes, { latitude: 90, longitude: 0 });
  expect(closest).toBe(nodes[1]);

  closest = getClosestNode(nodes, { latitude: 88, longitude: -28 });
  expect(closest).toBe(nodes[1]);
});

test('getClientConfig', () => {
  const nodes = getNodes({ PGEDGE_NODES: testNodes });
  expect(nodes.length).toBe(2);
  const node = nodes[0];

  const config = getClientConfig(node, {
    ssl: true,
    application_name: 'FOO',
  });

  expect(config).toMatchObject({
    host: 'h1',
    port: 5432,
    user: 'u1',
    password: 'p1',
    database: 'd1',
    ssl: true,
    application_name: 'FOO',
  });
});

test('connect', async () => {
  const env = { PGEDGE_NODES: testNodes };
  const config = { query_timeout: 33 };

  let location: Geolocation;
  let client: any;

  location = { latitude: 6, longitude: 11 };
  client = await connect({ env, location });
  expect(client.host).toBe('h1');
  expect(client.query_timeout).toBeUndefined();

  location = { latitude: 92, longitude: -29 };
  client = await connect({ env, location, config });
  expect(client.host).toBe('h2');
  expect(client.query_timeout).toBe(33);

  // Default location (Washington DC) is closer to h2
  client = await connect({ env });
  expect(client.host).toBe('h2');
});

test('connectWithoutNodes', async () => {
  await expect(connect({ nodes: [] })).rejects.toThrow('invalid options: at least one node must be provided');
});
