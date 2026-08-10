"use client";

import { useState } from "react";
import { clockInAction } from "./actions";

// Absen masuk memerlukan koordinat perangkat (geofence §8). Komponen kecil
// ini hanya mengambil lokasi lalu mengisi field tersembunyi — validasi
// radius tetap dilakukan di server.
export function ClockInForm() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getLocation = () => {
    setError(null);
    setLoading(true);
    if (!navigator.geolocation) {
      setError("Perangkat tidak mendukung geolokasi.");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(`Gagal mengambil lokasi: ${err.message}. Izinkan akses lokasi lalu coba lagi.`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3">
      {!coords ? (
        <>
          <button type="button" onClick={getLocation} className="btn-secondary w-full justify-center" disabled={loading}>
            {loading ? "Mengambil lokasi…" : "Ambil Lokasi Saya"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </>
      ) : (
        <form action={clockInAction} className="space-y-2">
          <input type="hidden" name="latitude" value={coords.lat} />
          <input type="hidden" name="longitude" value={coords.lng} />
          <p className="text-xs text-slate-500">
            Lokasi: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </p>
          <button type="submit" className="btn-primary w-full justify-center">Absen Masuk</button>
          <button type="button" onClick={getLocation} className="text-xs text-brand-600 hover:underline">
            Ambil ulang lokasi
          </button>
        </form>
      )}
    </div>
  );
}
