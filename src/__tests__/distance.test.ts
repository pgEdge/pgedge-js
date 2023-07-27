import { haversineDistance } from '../index';

test('DistanceZero', () => {
  const loc1 = { latitude: 0, longitude: 0 };
  const loc2 = { latitude: 0, longitude: 0 };
  expect(haversineDistance(loc1, loc2)).toBe(0);
});

test('DistanceOneDegreeOfLatitude', () => {
  // 1 degree is around 111 km at the equator
  const loc1 = { latitude: 0, longitude: 0 };
  const loc2 = { latitude: 1, longitude: 0 };
  const km = haversineDistance(loc1, loc2);
  const roundedValue = Math.round(km * 10) / 10;
  expect(roundedValue).toBe(111.2);
});

test('DistanceOneDegreeOfLongitude', () => {
  // 1 degree is around 111 km at the equator
  const loc1 = { latitude: 0, longitude: 0 };
  const loc2 = { latitude: 0, longitude: 1 };
  const km = haversineDistance(loc1, loc2);
  const roundedValue = Math.round(km * 10) / 10;
  expect(roundedValue).toBe(111.2);
});
