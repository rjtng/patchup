"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { addBaseLayer, MANILA, placeIcon, type Leaflet } from "@/components/maps/base";
import { locationErrorMessage, type Point } from "@/lib/tracking";

// About 10 cm: more would only be noise.
const round = ({ lat, lng }: { lat: number; lng: number }): Point => ({
  latitude: Math.round(lat * 1e6) / 1e6,
  longitude: Math.round(lng * 1e6) / 1e6,
});
const latLng = (p: Point): [number, number] => [p.latitude, p.longitude];

/**
 * Where a saved place is: tap the map or drag the pin, or use the phone's
 * location when there. It helps the technician find the place, and shows the
 * customer how far away they are on the way.
 */
export function PinPicker({ value, onChange }: { value: Point | null; onChange: (point: Point | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: Leaflet; map: LeafletMap; pin?: Marker } | null>(null);
  const [ready, setReady] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Zoom in on the next pin (after "Use my current location").
  const focus = useRef(false);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  // Leaflet needs the browser, so it's loaded here rather than imported for the server.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      const m = L.map(box.current, { zoomControl: false, scrollWheelZoom: false });
      L.control.zoom({ position: "topright" }).addTo(m);
      addBaseLayer(L, m);
      const start = latest.current.value;
      m.setView(start ? latLng(start) : MANILA, start ? 17 : 11);
      m.on("click", (e) => latest.current.onChange(round(e.latlng)));
      map.current = { L, map: m };
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  // Keep the pin where `value` says.
  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    const { L, map: m } = current;
    if (!value) {
      current.pin?.remove();
      current.pin = undefined;
      return;
    }
    if (!current.pin) {
      const pin = L.marker(latLng(value), { icon: placeIcon(L), draggable: true, keyboard: false, title: "The place" });
      pin.on("dragend", () => latest.current.onChange(round(pin.getLatLng())));
      current.pin = pin.addTo(m);
    } else {
      current.pin.setLatLng(latLng(value));
    }
    if (focus.current) {
      focus.current = false;
      m.setView(latLng(value), 17);
    } else if (!m.getBounds().contains(latLng(value))) {
      m.panTo(latLng(value));
    }
  }, [value, ready]);

  const pinMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("This browser can't tell where you are.");
      return;
    }
    setFinding(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFinding(false);
        focus.current = true;
        onChange(round({ lat: coords.latitude, lng: coords.longitude }));
      },
      (e) => {
        setFinding(false);
        setError(locationErrorMessage(e));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* `isolate` keeps Leaflet's layers under the app's sticky header and tabs. */}
      <div
        ref={box}
        role="region"
        aria-label="Map of where the place is"
        className="isolate h-60 w-full overflow-hidden rounded-card bg-surface"
      />
      <p role="status" className="text-sm text-muted">
        {value
          ? "Pinned. To move it, drag the pin or tap the map."
          : "Tap the map where the place is, or use your location if you're there now."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={pinMyLocation} disabled={finding} className="h-12 text-sm">
          <LocateFixed aria-hidden className="size-5" />
          {finding ? "Finding you…" : "Use my location"}
        </Button>
        {value && (
          <Button variant="ghost" onClick={() => onChange(null)} className="h-12 text-sm">
            Remove pin
          </Button>
        )}
      </div>
    </div>
  );
}
