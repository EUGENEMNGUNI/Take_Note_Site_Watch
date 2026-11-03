"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";

export type LiveMapSite = {
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

export type LiveMapPoint = {
  id: string;
  lat: number;
  lng: number;
  color: string;
  name: string;
  label: string;
  showLabel: boolean;
};

type Basemap = "street" | "satellite";

const BASEMAPS: Record<Basemap, { url: string; attribution: string; maxZoom: number }> = {
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export function LiveMap({ site, points }: { site: LiveMapSite; points: LiveMapPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const overlaysRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("street");
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      const container = containerRef.current;
      if (cancelled || !container || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(container, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      map.setView([site.latitude, site.longitude], 17);
      mapRef.current = map;
      overlaysRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      tilesRef.current = null;
      overlaysRef.current = null;
      setReady(false);
    };
    // The map is created once; site and points are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the base map tiles.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    tilesRef.current?.remove();
    const config = BASEMAPS[basemap];
    tilesRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    }).addTo(map);
    tilesRef.current.bringToBack();
  }, [ready, basemap]);

  // Draw the site radius and check-in positions.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const overlays = overlaysRef.current;
    if (!ready || !L || !map || !overlays) return;

    overlays.clearLayers();
    const centre = L.latLng(site.latitude, site.longitude);

    const radius = L.circle(centre, {
      radius: site.radius_m,
      color: "#3b5bdb",
      weight: 2,
      dashArray: "6 5",
      fillColor: "#3b5bdb",
      fillOpacity: 0.12,
    }).addTo(overlays);

    L.marker(centre, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "live-map-site",
        html: `<span>${escapeHtml(site.name || "Site")}</span>`,
        iconSize: undefined,
      }),
    }).addTo(overlays);

    const bounds = radius.getBounds();
    for (const point of points) {
      const position = L.latLng(point.lat, point.lng);
      const marker = L.circleMarker(position, {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: point.color,
        fillOpacity: 1,
      }).addTo(overlays);
      marker.bindTooltip(escapeHtml(point.name), {
        permanent: point.showLabel,
        direction: "bottom",
        offset: [0, 8],
        className: "live-map-tip",
      });
      bounds.extend(position);
    }

    map.invalidateSize();
    map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [24, 44], maxZoom: 18 });
  }, [ready, site, points]);

  return (
    <div className="live-map">
      <div ref={containerRef} className="live-map-canvas" role="region" aria-label="Live site map" />
      <div className="live-map-switch" role="group" aria-label="Map style">
        <button type="button" aria-pressed={basemap === "street"} onClick={() => setBasemap("street")}>
          Map
        </button>
        <button type="button" aria-pressed={basemap === "satellite"} onClick={() => setBasemap("satellite")}>
          Satellite
        </button>
      </div>
    </div>
  );
}
