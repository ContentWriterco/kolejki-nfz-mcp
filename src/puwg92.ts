/**
 * EPSG:2180 (PUWG 1992, Transverse Mercator on GRS80) <-> WGS84 (lat/lon), sub-metre accuracy in Poland.
 * Snyder, "Map Projections: A Working Manual", pp. 61-64.
 */
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9993;
const LON0 = (19 * Math.PI) / 180;
const FE = 500000;
const FN = -5300000;
const RAD = Math.PI / 180;

function meridian(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

/** WGS84 -> EPSG:2180, returns { x: easting, y: northing } in metres. */
export function toPuwg92(lat: number, lon: number): { x: number; y: number } {
  const phi = lat * RAD;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const Aa = (lon * RAD - LON0) * cos;
  const M = meridian(phi);
  const x = FE + K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120);
  const y =
    FN +
    K0 * (M + N * tan * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  return { x, y };
}

/** EPSG:2180 (easting x, northing y) -> WGS84. */
export function fromPuwg92(x: number, y: number): { lat: number; lon: number } {
  const M = (y - FN) / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1);
  const cos = Math.cos(phi1);
  const tan = Math.tan(phi1);
  const C1 = EP2 * cos * cos;
  const T1 = tan * tan;
  const N1 = A / Math.sqrt(1 - E2 * sin * sin);
  const R1 = (A * (1 - E2)) / (1 - E2 * sin * sin) ** 1.5;
  const D = (x - FE) / (N1 * K0);
  const lat =
    phi1 -
    ((N1 * tan) / R1) *
      ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = LON0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / cos;
  return { lat: lat / RAD, lon: lon / RAD };
}
