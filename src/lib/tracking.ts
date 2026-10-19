// Live tracking: distances, a rough arrival time, and the map's tiles.

export type Point = { latitude: number; longitude: number };

/** A booking's or address's map pin, if it has one. */
export const pin = (p: { latitude: number | null; longitude: number | null }): Point | null =>
  p.latitude != null && p.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : null;

/** Straight-line distance in km (haversine). */
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Roads wind and city traffic is slow, so the arrival time is a rough guess
// (shown as "about"): the straight line, 40% longer, at 20 km/h.
const ROAD_FACTOR = 1.4;
const AVERAGE_KMH = 20;

/** Minutes until arrival, roughly, at least 1. */
export const etaMinutes = (km: number) => Math.max(1, Math.round(((km * ROAD_FACTOR) / AVERAGE_KMH) * 60));

/** "850 m", "3.1 km" */
export const formatDistance = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`);

/** "just now", "40 seconds ago", "5 minutes ago" */
export function formatAgo(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
}

// A position older than this probably means the phone lost signal or closed PatchUp.
export const STALE_AFTER_MS = 2 * 60 * 1000;

// Map tiles from OpenStreetMap. Their policy is meant for light use: before
// PatchUp grows, switch to a tile provider (see README, "Live tracking").
export const MAP_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

/** Why the phone couldn't give its location, for people. */
export function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Location is blocked for PatchUp in this browser's settings.";
  return "We couldn't get your location. Check that location is on, then try again.";
}
