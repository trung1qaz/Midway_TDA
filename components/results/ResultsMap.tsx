"use client";

// Leaflet touches `window` at import time, so this module must only be loaded
// in the browser: import it through ResultsMapLoader (next/dynamic, ssr:false).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { formatDistance, formatDuration, strategyLabel } from "@/lib/format";
import type { CandidatesResponse } from "@/types/api";

// divIcons are plain HTML, which also sidesteps Leaflet's default marker
// images breaking under bundlers. Styles live in app/globals.css.
function memberIcon(initial: string) {
  return L.divIcon({
    className: "midway-pin midway-pin-member",
    html: `<span>${escapeHtml(initial)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function candidateIcon(n: number) {
  return L.divIcon({
    className: "midway-pin midway-pin-candidate",
    html: `<span>${n}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Route credit next to the OSM tile credit.
function OsrmAttribution() {
  const map = useMap();
  useEffect(() => {
    const text = 'Drive times: <a href="https://project-osrm.org/">OSRM</a>';
    map.attributionControl.addAttribution(text);
    return () => {
      map.attributionControl.removeAttribution(text);
    };
  }, [map]);
  return null;
}

export default function ResultsMap({ data }: { data: CandidatesResponse }) {
  const allPoints = [...data.members.map((m) => m.point), ...data.candidates.map((c) => c.point)];
  const bounds = L.latLngBounds(allPoints.map((p) => [p.lat, p.lng] as [number, number]));

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [40, 40], maxZoom: 11 }}
      scrollWheelZoom={false}
      className="h-[460px] w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <OsrmAttribution />

      {data.members.map((m) => (
        <Marker
          key={m.id}
          position={[m.point.lat, m.point.lng]}
          icon={memberIcon(m.name.trim().charAt(0).toUpperCase() || "?")}
          title={m.name}
        >
          <Popup>
            <strong>{m.name}</strong>
            <br />
            Member location
          </Popup>
        </Marker>
      ))}

      {data.candidates.map((c, j) => (
        <Marker key={c.id} position={[c.point.lat, c.point.lng]} icon={candidateIcon(j + 1)} title={c.name}>
          <Popup minWidth={220}>
            <div className="flex flex-col gap-1">
              <strong>
                {j + 1}. {c.name}
              </strong>
              <span className="text-xs text-zinc-500">{c.displayName}</span>
              <span className="text-xs text-zinc-500">Found by: {strategyLabel[c.strategy] ?? c.strategy}</span>
              <ul className="mt-1">
                {data.members.map((m, i) => (
                  <li key={m.id}>
                    {m.name}:{" "}
                    {data.matrix
                      ? data.matrix.durationsSec[i][j] == null
                        ? "no route"
                        : `${formatDuration(data.matrix.durationsSec[i][j])} · ${formatDistance(
                            data.matrix.distancesM[i][j]
                          )}`
                      : "travel time unavailable"}
                  </li>
                ))}
              </ul>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
