"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";
import { MAP_TILES, type Point } from "@/lib/tracking";

type Leaflet = typeof import("leaflet");

// Markers are drawn with HTML (no image files): the technician as a navy dot
// with their initial, the customer's place as a house pin.
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const technicianIcon = (L: Leaflet, initial: string) =>
  L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:36px;height:36px;border-radius:9999px;background:#004aad;color:#fff;font:700 15px/1 Montserrat Variable,system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">${escapeHtml(initial)}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
const placeIcon = (L: Leaflet) =>
  L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#ffde59;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"><svg viewBox="0 0 24 24" width="16" height="16" style="transform:rotate(45deg)" fill="none" stroke="#0f1b3d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

const latLng = (p: Point): [number, number] => [p.latitude, p.longitude];

/**
 * A map with the technician on the way and the customer's place. Follows the
 * technician: it re-fits whenever they'd leave the visible area.
 */
export function TripMap({
  technician,
  destination,
  initial,
  label,
}: {
  technician: Point | null;
  destination: Point | null;
  initial: string;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: Leaflet; map: LeafletMap; technician?: Marker; place?: Marker } | null>(null);

  // Leaflet needs the browser, so it's loaded here rather than imported for the server.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      L.control.zoom({ position: "topright" }).addTo(m);
      L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(m);
      const { logo } = MAP_TILES;
      if (logo) {
        // The tile provider's logo, bottom left (its terms ask for it), above
        // the credits line, which spans the whole map on a phone.
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
        control.addTo(m);
      }
      m.setView([14.5995, 120.9842], 12); // Manila, until there's something to show
      map.current = { L, map: m };
      box.current.dispatchEvent(new Event("patchup:map-ready"));
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  // Place the markers and keep both in view.
  useEffect(() => {
    const place = () => {
      const current = map.current;
      if (!current) return;
      const { L, map: m } = current;
      if (destination) {
        current.place ??= L.marker(latLng(destination), { icon: placeIcon(L), title: "Your place", keyboard: false }).addTo(m);
        current.place.setLatLng(latLng(destination));
      }
      if (technician) {
        current.technician ??= L.marker(latLng(technician), { icon: technicianIcon(L, initial), title: label, keyboard: false }).addTo(m);
        current.technician.setLatLng(latLng(technician));
      }
      const points = [technician, destination].filter((p): p is Point => p !== null).map(latLng);
      if (points.length === 0) return;
      const bounds = L.latLngBounds(points);
      if (!m.getBounds().pad(-0.1).contains(bounds)) m.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
    };
    place();
    const el = box.current;
    el?.addEventListener("patchup:map-ready", place);
    return () => el?.removeEventListener("patchup:map-ready", place);
  }, [technician, destination, initial, label]);

  // `isolate` keeps Leaflet's layers under the app's sticky header and tabs.
  return (
    <div
      ref={box}
      role="region"
      aria-label={label}
      className="isolate h-64 w-full overflow-hidden rounded-card bg-surface"
    />
  );
}
