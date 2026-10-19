import type { Map as LeafletMap } from "leaflet";
import { MAP_TILES } from "@/lib/tracking";

// What the app's maps share. Leaflet itself is loaded in the browser by each
// map (it can't run on the server) and passed in.

export type Leaflet = typeof import("leaflet");

/** The map's tiles and credits, and the tile provider's logo where its terms ask for it. */
export function addBaseLayer(L: Leaflet, map: LeafletMap) {
  L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(map);
  const { logo } = MAP_TILES;
  if (!logo) return;
  // Bottom left, above the credits line, which spans the whole map on a phone.
  const control = new L.Control({ position: "bottomleft" });
  control.onAdd = () => {
    const link = L.DomUtil.create("a");
    link.href = logo.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.style.marginBottom = "24px";
    link.innerHTML = `<img src="${logo.src}" alt="${logo.alt}" style="display:block;height:20px;width:auto">`;
    return link;
  };
  control.addTo(map);
}

/** Manila, for a map with nothing to show yet. */
export const MANILA: [number, number] = [14.5995, 120.9842];

/** The customer's place: a yellow pin with a house, drawn with HTML (no image files). */
export const placeIcon = (L: Leaflet) =>
  L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#ffde59;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"><svg viewBox="0 0 24 24" width="16" height="16" style="transform:rotate(45deg)" fill="none" stroke="#0f1b3d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
