/** Memeriksa saldo terhadap dokumennya. Hanya membaca. */
import { reconcileStockLevels } from "@/lib/inventory";
import { db } from "@/lib/db";
async function main() {
  const beda = await reconcileStockLevels();
  console.log("selisih saldo vs dokumen:", beda.length);
  for (const b of beda.slice(0, 10)) console.log("  ", JSON.stringify(b));
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
