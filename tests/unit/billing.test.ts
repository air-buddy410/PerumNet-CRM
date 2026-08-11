import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { taxOf } from "@/lib/billing";

// Uang disimpan sebagai BigInt rupiah bulat — tidak ada floating point.
// Pembulatan PPN adalah half-up dan harus dikunci: pergeseran satu rupiah
// dikalikan ribuan invoice adalah selisih yang nyata.
describe("taxOf", () => {
  test("PPN 11% dari 175.000", () => {
    assert.equal(taxOf(175_000n, 11), 19_250n);
  });

  test("PPN 0% menghasilkan nol", () => {
    assert.equal(taxOf(999_999n, 0), 0n);
  });

  test("membulatkan setengah KE ATAS", () => {
    // 100 × 0,5% = 0,5 → 1
    assert.equal(taxOf(100n, 0.5), 1n);
  });

  test("membulatkan ke bawah bila di bawah setengah", () => {
    // 100 × 0,4% = 0,4 → 0
    assert.equal(taxOf(100n, 0.4), 0n);
  });

  test("persen dua desimal ditangani", () => {
    assert.equal(taxOf(1_000_000n, 11.25), 112_500n);
  });

  test("nominal besar tidak kehilangan presisi", () => {
    // Angka ini melewati batas aman floating point bila dihitung sebagai number.
    assert.equal(taxOf(9_007_199_254_740_993n, 10), 900_719_925_474_099n);
  });
});
