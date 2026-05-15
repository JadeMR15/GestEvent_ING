import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function EventMap({ events }: { events: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const withCoords = events.filter((e) => e.latitude && e.longitude);

  const depsKey = withCoords.map((e) => `${e.id}:${e.latitude}:${e.longitude}`).join(",");

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;

    // Nettoie tout résidu Leaflet sur le container avant d'init
    const el = containerRef.current as any;
    if (el._leaflet_id) {
      delete el._leaflet_id;
    }

    Promise.all([import("leaflet"), import("leaflet.markercluster")]).then(([mod]) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default as any;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const franceBounds = L.latLngBounds([41.0, -5.5], [51.5, 10.0]);
      const map = L.map(containerRef.current, {
        scrollWheelZoom: true,
        maxBounds: franceBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 5,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const eventsWithCoords = events.filter((e) => e.latitude && e.longitude);

      const clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 60,
        iconCreateFunction: (cluster: any) => {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div style="background:#6B0F2C;color:white;font-weight:700;font-size:13px;font-family:Inter,sans-serif;width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(114,36,62,.5);display:flex;align-items:center;justify-content:center">${count}</div>`,
            className: "",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
        },
      });

      const pin = L.divIcon({
        html: `<div style="background:#6B0F2C;width:18px;height:18px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(114,36,62,.55)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -13],
        className: "",
      });

      eventsWithCoords.forEach((e) => {
        const dateStr = format(new Date(e.starts_at), "PPP à p", { locale: fr });
        const marker = L.marker([e.latitude, e.longitude], { icon: pin });
        marker.bindPopup(
          `<div style="min-width:200px;font-family:Inter,sans-serif;line-height:1.5">
            ${e.cover_image_url ? `<img src="${e.cover_image_url}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block" />` : ""}
            <p style="font-weight:600;font-size:14px;margin:0 0 4px;color:#2C2C2A">${e.title}</p>
            <p style="font-size:12px;color:#888;margin:0 0 2px">📅 ${dateStr}</p>
            ${e.city ? `<p style="font-size:12px;color:#888;margin:0 0 8px">📍 ${e.city}</p>` : ""}
            <a href="/events/${e.id}" style="color:#6B0F2C;font-weight:600;font-size:13px;text-decoration:none">Voir l'événement →</a>
          </div>`,
          { maxWidth: 260 }
        );
        clusterGroup.addLayer(marker);
      });

      map.addLayer(clusterGroup);

      const setView = () => {
        if (eventsWithCoords.length === 0) {
          map.setView([46.2, 2.2], 6);
        } else if (eventsWithCoords.length === 1) {
          map.setView([eventsWithCoords[0].latitude, eventsWithCoords[0].longitude], 14);
        } else {
          const bounds = L.latLngBounds(
            eventsWithCoords.map((e: any) => [e.latitude, e.longitude] as [number, number])
          );
          map.fitBounds(bounds, { padding: [48, 48] });
        }
      };

      // ResizeObserver : dès que le container a des dimensions réelles, on
      // recalcule la taille de la carte. Couvre le cas lazy+Suspense où le
      // layout n'est pas encore stable quand useEffect se déclenche.
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          map.invalidateSize();
          setView();
          ro?.disconnect();
          ro = null;
        }
      });
      if (containerRef.current) ro.observe(containerRef.current);

      // Fallback au cas où ResizeObserver ne se déclenche pas (déjà dimensionné)
      requestAnimationFrame(() => {
        if (!cancelled) {
          map.invalidateSize();
          setView();
        }
      });
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-[#D5A0A8] shadow-elegant"
        style={{ height: 520 }}
      />
      {withCoords.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Aucun événement avec une ville renseignée sur la carte.
          </p>
        </div>
      )}
    </div>
  );
}
