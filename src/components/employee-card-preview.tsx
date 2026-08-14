"use client";

import { Rotate3D, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

export type EmployeeCardPreviewData = {
  fullName: string;
  jobTitle: string | null;
  divisionName: string | null;
  employeeNo: string | null;
  cardNumber: string;
  photoUrl: string | null;
  qrSvg: string | null;
};

type CardFaceProps = {
  data: EmployeeCardPreviewData;
  side: "front" | "back";
  mode: "hrd" | "public";
  ariaHidden?: boolean;
};

function initials(value: string) {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return result || "PN";
}

function verticalName(value: string) {
  const firstWord = value.trim().split(/\s+/)[0] || "PERUMNET";
  return firstWord.slice(0, 10).toUpperCase();
}

function CardFace({ data, side, mode, ariaHidden = false }: CardFaceProps) {
  if (side === "back") {
    return (
      <article
        className="employee-card-face employee-card-face-back"
        aria-label="Sisi belakang kartu pegawai"
        aria-hidden={ariaHidden}
      >
        <div className="employee-card-pattern" aria-hidden="true" />
        <div className="employee-card-back-content">
          <span className="employee-card-back-kicker">PerumNet</span>
          <h3>Perum Network</h3>
          <p className="employee-card-back-caption">Kartu identitas resmi</p>

          <div className="employee-card-qr-frame">
            {mode === "public" ? (
              <div className="employee-card-qr-missing">
                <ShieldCheck aria-hidden="true" />
                <span>Verifikasi dibuka melalui QR resmi</span>
              </div>
            ) : data.qrSvg ? (
              <div
                className="employee-card-qr"
                role="img"
                aria-label="QR verifikasi kartu pegawai"
                dangerouslySetInnerHTML={{ __html: data.qrSvg }}
              />
            ) : (
              <div className="employee-card-qr-missing">
                <ShieldCheck aria-hidden="true" />
                <span>QR belum tersedia</span>
              </div>
            )}
          </div>

          <p className="employee-card-back-number">{data.cardNumber}</p>
          <div className="employee-card-back-site">
            <span aria-hidden="true">◎</span>
            <span>www.perumnet.id</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className="employee-card-face employee-card-face-front"
      aria-label="Sisi depan kartu pegawai"
      aria-hidden={ariaHidden}
    >
      <div className="employee-card-front-rail">
        <img src="/brand/perumnet-logo.png" alt="PerumNet" className="employee-card-logo" />
        <span className="employee-card-vertical-name" aria-hidden="true">
          {verticalName(data.fullName)}
        </span>
      </div>

      <div className="employee-card-portrait-wrap">
        {data.photoUrl ? (
          <>
            <img
              src={data.photoUrl}
              alt={`Foto ${data.fullName}`}
              className="employee-card-portrait"
              onError={(event) => {
                event.currentTarget.hidden = true;
                event.currentTarget.nextElementSibling?.removeAttribute("hidden");
              }}
            />
            <span className="employee-card-portrait-fallback" hidden>
              {initials(data.fullName)}
            </span>
          </>
        ) : (
          <span className="employee-card-portrait-fallback">{initials(data.fullName)}</span>
        )}
      </div>

      <div className="employee-card-front-footer">
        <p className="employee-card-name">{data.fullName}</p>
        <p className="employee-card-job">{data.jobTitle || "Jabatan belum diisi"}</p>
        <p className="employee-card-division">{data.divisionName || "PerumNet"}</p>
        <div className="employee-card-front-meta">
          {mode === "hrd" && data.employeeNo ? <span>ID {data.employeeNo}</span> : <span>PerumNet</span>}
          <span>{data.cardNumber}</span>
        </div>
      </div>
    </article>
  );
}

export function EmployeeCardPreview({
  data,
  mode = "hrd",
  print = false,
}: {
  data: EmployeeCardPreviewData;
  mode?: "hrd" | "public";
  print?: boolean;
}) {
  const [showBack, setShowBack] = useState(false);
  const titleId = useId();

  return (
    <div className={`employee-card-preview ${print ? "is-print" : ""}`} data-mode={mode}>
      {!print && (
        <button
          type="button"
          className="employee-card-flip-button btn-secondary"
          aria-controls={titleId}
          aria-pressed={showBack}
          onClick={() => setShowBack((current) => !current)}
        >
          <Rotate3D aria-hidden="true" />
          {showBack ? "Lihat sisi depan" : "Balik kartu"}
        </button>
      )}

      {print ? (
        <div id={titleId} className="employee-card-print-faces">
          <CardFace data={data} side="front" mode={mode} />
          <CardFace data={data} side="back" mode={mode} />
        </div>
      ) : (
        <div id={titleId} className="employee-card-perspective">
          <div className={`employee-card-flipper ${showBack ? "is-back" : ""}`}>
            <CardFace data={data} side="front" mode={mode} ariaHidden={showBack} />
            <CardFace data={data} side="back" mode={mode} ariaHidden={!showBack} />
          </div>
        </div>
      )}

      {!print && (
        <p className="employee-card-preview-hint">
          {showBack ? "Sisi belakang kartu" : "Sisi depan kartu"} · ukuran layar mengikuti rasio ISO B4
        </p>
      )}
    </div>
  );
}

export function EmployeeCardPrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      Cetak kartu
    </button>
  );
}
