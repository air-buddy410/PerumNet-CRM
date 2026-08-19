// Sekali pakai: menuliskan daftar langganan CRM ke TSV untuk dibandingkan
// dengan tagihan ALUS. Baca-saja, tidak menulis apa pun ke basis data.
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";

async function main() {
  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true,
      status: true,
      monthlyPrice: true,
      customer: { select: { name: true } },
      billingProfile: { select: { billingStartAt: true, isActive: true } },
    },
  });
  const baris = subs.map((s) =>
    [
      s.serviceNumber,
      s.status,
      String(s.monthlyPrice),
      s.billingProfile ? s.billingProfile.billingStartAt.toISOString().slice(0, 10) : "TANPA-PROFIL",
      s.billingProfile?.isActive === false ? "PROFIL-NONAKTIF" : "",
      s.customer.name,
    ].join("\t")
  );
  writeFileSync("/app/data/crm-langganan.tsv", baris.join("\n"));
  console.log(`baris: ${baris.length}`);
}
main().finally(() => db.$disconnect());
