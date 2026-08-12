"use client";

import { RefreshCw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 30_000;

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function NetworkMonitorControls({
  downCount,
  updatedAt,
}: {
  downCount: number;
  updatedAt: string;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const previousDownCount = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const playAlarm = useCallback(() => {
    if (!alarmEnabled || typeof window === "undefined") return;

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = audioContext.current ?? new AudioContextConstructor();
    audioContext.current = context;

    const beep = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 760;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    };

    if (context.state === "suspended") {
      void context.resume().then(beep);
    } else {
      beep();
    }
  }, [alarmEnabled]);

  useEffect(() => {
    if (previousDownCount.current === null) {
      previousDownCount.current = downCount;
      return;
    }

    if (downCount > previousDownCount.current) playAlarm();
    previousDownCount.current = downCount;
  }, [downCount, playAlarm]);

  useEffect(() => {
    setIsRefreshing(false);
  }, [updatedAt]);

  useEffect(() => {
    let interval: number | undefined;

    const schedule = () => {
      if (interval !== undefined) window.clearInterval(interval);
      if (document.visibilityState !== "visible") return;
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          setIsRefreshing(true);
          router.refresh();
        }
      }, REFRESH_INTERVAL_MS);
    };

    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [router]);

  function refreshNow() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <span className="text-slate-500" aria-live="polite">
        Terakhir diperbarui {formatUpdatedAt(updatedAt)}
        {isRefreshing ? " · memperbarui…" : ""}
      </span>
      <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 whitespace-nowrap text-slate-600">
        <input
          type="checkbox"
          checked={alarmEnabled}
          onChange={(event) => setAlarmEnabled(event.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        {alarmEnabled ? <Volume2 aria-hidden="true" size={15} /> : <VolumeX aria-hidden="true" size={15} />}
        Alarm suara
      </label>
      <button
        type="button"
        className="btn-secondary min-h-[36px] gap-2 px-3 text-xs"
        onClick={refreshNow}
        disabled={isRefreshing}
        aria-label="Perbarui Network Monitor"
      >
        <RefreshCw aria-hidden="true" size={14} className={isRefreshing ? "animate-spin" : ""} />
        Perbarui
      </button>
    </div>
  );
}
