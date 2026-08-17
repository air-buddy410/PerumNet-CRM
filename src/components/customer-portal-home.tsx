import Link from "next/link";
import type { BerandaPortal } from "@/lib/portal-service";
import { formatRupiah } from "@/lib/constants";
import { formatUiDateTime } from "@/components/ui-formatters";
import { Logo } from "@/components/logo";
import { CustomerPortalIncidentForm } from "@/components/customer-portal-incident-form";
import { CustomerPortalLogoutButton } from "@/components/customer-portal-logout-button";

const connectionMeta: Record<string, { label: string; className: string; description: string }> = {
  ONLINE: { label: "Online", className: "is-online", description: "Koneksi terakhir terpantau aktif." },
  OFFLINE: { label: "Offline", className: "is-offline", description: "Sesi terakhir tidak sedang terhubung." },
  DISABLED: { label: "Dinonaktifkan", className: "is-disabled", description: "Koneksi dinonaktifkan pada router." },
  "BELUM DIKETAHUI": { label: "Belum diketahui", className: "is-unknown", description: "Belum ada data sesi yang dapat dipastikan." },
};

function connectionView(status: string) {
  return connectionMeta[status.trim().toUpperCase()] ?? {
    label: status || "Belum diketahui",
    className: "is-unknown",
    description: "Status koneksi belum tersedia dari sumber monitoring.",
  };
}

export function CustomerPortalHome({ data }: { data: BerandaPortal }) {
  const connection = connectionView(data.koneksi.status);

  return (
    <main className="customer-portal-shell">
      <header className="customer-portal-header">
        <Link href="/pelanggan" className="customer-portal-brand" aria-label="Beranda portal pelanggan">
          <Logo markClassName="h-9 w-8" textClassName="text-[19px]" />
          <span>PORTAL PELANGGAN</span>
        </Link>
        <div className="customer-portal-header-actions">
          <span className="customer-portal-service">{data.nomorLayanan}</span>
          <CustomerPortalLogoutButton />
        </div>
      </header>

      <div className="customer-portal-content">
        <section className="customer-portal-welcome">
          <div>
            <span className="customer-portal-eyebrow">PerumNet Home</span>
            <h1>Halo, {data.nama}</h1>
            <p>Pantau layanan internet dan informasi pelanggan Anda dari satu tempat.</p>
          </div>
          <div className={`customer-portal-connection ${connection.className}`}>
            <span className="customer-portal-connection-dot" aria-hidden="true" />
            <div>
              <strong>{connection.label}</strong>
              <span>{connection.description}</span>
            </div>
          </div>
        </section>

        <section className="customer-portal-grid" aria-label="Ringkasan layanan">
          <article className="customer-portal-card customer-portal-card-wide">
            <div className="customer-portal-card-heading">
              <div>
                <span className="customer-portal-card-kicker">Status koneksi</span>
                <h2>{connection.label}</h2>
              </div>
              <span className={`customer-portal-status-badge ${connection.className}`}>{connection.label}</span>
            </div>
            <dl className="customer-portal-detail-grid">
              <div>
                <dt>Terakhir terlihat</dt>
                <dd>{formatUiDateTime(data.koneksi.terakhirTerlihat, "Belum tersedia")}</dd>
              </div>
              <div>
                <dt>Alamat layanan</dt>
                <dd>{data.alamat ?? "Belum tersedia"}</dd>
              </div>
            </dl>
            {data.koneksi.status.trim().toUpperCase() === "BELUM DIKETAHUI" && (
              <p className="customer-portal-honest-note">Status ini belum dapat disimpulkan. Belum diketahui tidak berarti layanan sedang offline.</p>
            )}
          </article>

          <article className="customer-portal-card">
            <div className="customer-portal-card-heading">
              <div>
                <span className="customer-portal-card-kicker">Paket layanan</span>
                <h2>{data.paket?.nama ?? "Belum tersedia"}</h2>
              </div>
            </div>
            {data.paket ? (
              <dl className="customer-portal-detail-grid customer-portal-detail-grid-compact">
                <div><dt>Kecepatan</dt><dd>{data.paket.unduhMbps}/{data.paket.unggahMbps} Mbps</dd></div>
                <div><dt>Harga bulanan</dt><dd>{formatRupiah(data.paket.hargaBulanan)}</dd></div>
              </dl>
            ) : <p className="customer-portal-muted">Informasi paket belum tersedia.</p>}
          </article>

          <article className="customer-portal-card">
            <div className="customer-portal-card-heading">
              <div>
                <span className="customer-portal-card-kicker">Tiket terbuka</span>
                <h2>{data.tiketTerbuka}</h2>
              </div>
              <span className="customer-portal-card-icon" aria-hidden="true">?</span>
            </div>
            <p className="customer-portal-muted">
              {data.tiketTerbuka > 0 ? "Laporan Anda sedang ditangani oleh tim kami." : "Belum ada laporan gangguan yang terbuka."}
            </p>
          </article>
        </section>

        <CustomerPortalIncidentForm openTicketCount={data.tiketTerbuka} />

        <section className="customer-portal-card customer-portal-billing" aria-labelledby="customer-portal-billing-title">
          <div className="customer-portal-card-heading">
            <div>
              <span className="customer-portal-card-kicker">Tagihan</span>
              <h2 id="customer-portal-billing-title">Informasi pembayaran</h2>
            </div>
          </div>
          {data.tagihan.diCrm ? (
            <p className="customer-portal-muted">Ringkasan tagihan akan ditampilkan setelah data penagihan tersedia.</p>
          ) : (
            <p className="customer-portal-honest-note">{data.tagihan.pesan}</p>
          )}
        </section>

        <section className="customer-portal-card" aria-labelledby="customer-portal-announcement-title">
          <div className="customer-portal-card-heading">
            <div>
              <span className="customer-portal-card-kicker">Informasi terbaru</span>
              <h2 id="customer-portal-announcement-title">Pengumuman</h2>
            </div>
          </div>
          {data.pengumuman.length === 0 ? (
            <p className="customer-portal-muted">Belum ada pengumuman untuk ditampilkan.</p>
          ) : (
            <div className="customer-portal-announcement-list">
              {data.pengumuman.map((announcement) => (
                <article key={announcement.id} className="customer-portal-announcement">
                  <div className="customer-portal-announcement-meta">
                    <strong>{announcement.judul}</strong>
                    {announcement.badge && <span>{announcement.badge}</span>}
                  </div>
                  <p>{announcement.isi}</p>
                  <time dateTime={announcement.mulai.toISOString()}>{formatUiDateTime(announcement.mulai)}</time>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="customer-portal-footer">
        <span>PerumNet · Portal pelanggan</span>
        <span>Status dan informasi mengikuti data yang tersedia dari sistem.</span>
      </footer>
    </main>
  );
}

export function CustomerPortalUnavailable({ message }: { message: string }) {
  return (
    <main className="customer-portal-shell customer-portal-shell-centered">
      <section className="customer-portal-empty-card" role="status">
        <Link href="/pelanggan" className="customer-portal-brand" aria-label="Portal pelanggan">
          <Logo markClassName="h-9 w-8" textClassName="text-[19px]" />
          <span>PORTAL PELANGGAN</span>
        </Link>
        <div className="customer-portal-empty-icon" aria-hidden="true">i</div>
        <h1>Portal pelanggan belum tersedia</h1>
        <p>{message}</p>
        <Link href="/pelanggan/login" className="btn-secondary">Kembali ke halaman masuk</Link>
      </section>
    </main>
  );
}
