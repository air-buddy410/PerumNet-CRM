import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  INTEGRATION_PROVIDERS,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { regenerateTokenAction } from "../actions";

export const metadata = { title: "Detail Integrasi" };

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const { id } = await params;
  const sp = await searchParams;

  const integration = await db.integration.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!integration) notFound();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3300";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const webhookUrl = `${proto}://${host}/api/integrations/${integration.code}/webhook`;
  const provLabel =
    INTEGRATION_PROVIDERS.find(([v]) => v === integration.provider)?.[1] ?? integration.provider;

  return (
    <div className="max-w-4xl">
      <BackLink href="/settings/integrations" label="Kembali ke daftar integrasi" />
      <PageHeader
        title={`${integration.name} (${integration.code})`}
        subtitle={`${provLabel} · ${integration.baseUrl ?? "tanpa base URL"}`}
        action={
          <Badge
            value={integration.isEnabled ? "ACTIVE" : "INACTIVE"}
            label={integration.isEnabled ? "Aktif" : "Nonaktif"}
          />
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <h2 className="mb-3 text-sm font-medium">Webhook Monitoring Masuk (§30–31)</h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">URL</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">{webhookUrl}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Header</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">
                x-webhook-token: {integration.webhookToken}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Credential Ref</dt>
              <dd className="mt-0.5 font-mono text-xs">{integration.credentialRef ?? "-"}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="mb-1 text-xs font-medium text-slate-500">Contoh payload alert:</p>
            <pre className="overflow-x-auto text-xs text-slate-600">{`{
  "status": "FIRING",          // atau "RESOLVED" (auto-clear)
  "severity": "CRITICAL",      // Zabbix "Disaster"/"High" juga dikenali
  "message": "Device down: rtr-pop-01",
  "deviceHostname": "rtr-pop-01",
  "siteCode": "POP-01",
  "dedupKey": "opsional"       // duplikat dikelompokkan (anti-flooding)
}`}</pre>
          </div>
          {integration.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{integration.notes}</p>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-3 text-sm font-medium">Rotasi Token</h2>
          <p className="mb-3 text-xs text-slate-500">
            Token lama langsung tidak berlaku — perbarui konfigurasi di sistem monitoring setelah rotasi.
          </p>
          <form action={regenerateTokenAction}>
            <input type="hidden" name="integrationId" value={integration.id} />
            <button type="submit" className="btn-danger w-full justify-center">
              Buat Token Baru
            </button>
          </form>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">
          Log Event Terakhir
        </h2>
        {integration.events.length === 0 ? (
          <EmptyState message="Belum ada event masuk." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Waktu</th>
                <th className="th">Arah</th>
                <th className="th">Jenis</th>
                <th className="th">Status</th>
                <th className="th">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {integration.events.map((e) => (
                <tr key={e.id}>
                  <td className="td text-xs">{formatDateTime(e.createdAt)}</td>
                  <td className="td text-xs">{e.direction === "IN" ? "Masuk" : "Keluar"}</td>
                  <td className="td text-xs">{e.eventType}</td>
                  <td className="td">
                    <Badge
                      value={e.status === "OK" ? "APPROVED" : "REJECTED"}
                      label={e.status}
                    />
                  </td>
                  <td className="td text-xs">{e.detail ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
