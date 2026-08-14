import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  maskIdentity,
  maskPhone,
  maskEmail,
  redactCustomer,
  redactCustomers,
  type PiiPelanggan,
} from "@/lib/customer-pii";

// NIK asli dari berkas PerumNet, dipakai karena strukturnya yang penting:
// 5107 05 710786 0001 → 5107 05 = Karangasem, 710786 = lahir 31-07-1986
// (hari +40 menandakan perempuan), 0001 = urutan.
const NIK = "5107057107860001";

describe("maskIdentity", () => {
  test("menyembunyikan tepat bagian tengah — di situlah tanggal lahirnya", () => {
    const hasil = maskIdentity(NIK);
    assert.equal(hasil, "5107••••••••0001");
    // Yang paling penting: enam digit tanggal lahir tidak boleh tersisa.
    assert.ok(!hasil!.includes("710786"), "tanggal lahir masih terbaca di NIK tersamar");
  });

  test("empat digit awal dan akhir tetap terbaca untuk pencocokan sekilas", () => {
    assert.match(maskIdentity(NIK)!, /^5107/);
    assert.match(maskIdentity(NIK)!, /0001$/);
  });

  test("nomor terlalu pendek disamarkan SELURUHNYA, bukan dibiarkan bocor", () => {
    // Rumus potong pertama-4/terakhir-4 pada nomor 8 digit akan menghasilkan
    // nomor UTUH tanpa satu bintang pun. Itu kegagalan yang paling mudah luput.
    assert.equal(maskIdentity("12345678"), "••••••••");
    assert.equal(maskIdentity("1234"), "••••");
    assert.equal(maskIdentity("123456789"), "1234•6789");
  });

  test("kosong tetap kosong, bukan string bintang", () => {
    assert.equal(maskIdentity(null), null);
    assert.equal(maskIdentity(undefined), null);
    assert.equal(maskIdentity("   "), null);
  });
});

describe("maskPhone", () => {
  test("hanya empat digit terakhir tersisa", () => {
    assert.equal(maskPhone("081236023387"), "••••••••3387");
    assert.match(maskPhone("085738776634")!, /6634$/);
  });

  test("nomor sangat pendek disamarkan penuh", () => {
    assert.equal(maskPhone("0812"), "••••");
  });

  test("kosong tetap null", () => {
    assert.equal(maskPhone(""), null);
    assert.equal(maskPhone(null), null);
  });
});

describe("maskEmail", () => {
  test("huruf pertama dan domain tetap terbaca", () => {
    assert.equal(maskEmail("kadekyasa@gmail.com"), "k••••••@gmail.com");
    assert.match(maskEmail("budi@perumnet.id")!, /@perumnet\.id$/);
  });

  test("alamat tanpa @ disamarkan penuh — jangan diperlakukan sebagai email", () => {
    assert.equal(maskEmail("bukanemail"), "••••••••");
  });

  test("nama satu huruf tidak menjadi kosong", () => {
    assert.equal(maskEmail("a@gmail.com"), "a••••@gmail.com");
  });
});

describe("redactCustomer", () => {
  const baris = {
    id: "c1",
    name: "Ni Made Darmini",
    identityNumber: NIK,
    phone: "081236023387",
    email: "kadekyasa@gmail.com",
    birthDate: new Date("1986-07-31"),
    address: "Br. Dinas Sadimara",
  };

  test("dengan izin: dikembalikan apa adanya", () => {
    const h = redactCustomer(baris, true);
    assert.equal(h.identityNumber, NIK);
    assert.equal(h.phone, "081236023387");
    assert.deepEqual(h.birthDate, baris.birthDate);
  });

  test("tanpa izin: seluruh bidang pribadi tersamar", () => {
    const h = redactCustomer(baris, false);
    assert.equal(h.identityNumber, "5107••••••••0001");
    assert.equal(h.phone, "••••••••3387");
    assert.equal(h.email, "k••••••@gmail.com");
  });

  test("tanggal lahir DIKOSONGKAN — kalau tidak, samaran NIK jadi sia-sia", () => {
    // Enam digit tengah NIK yang disembunyikan itu tanggal lahir. Menampilkan
    // tanggal lahir utuh di kolom sebelahnya membatalkan seluruh gunanya.
    assert.equal(redactCustomer(baris, false).birthDate, null);
  });

  test("bidang bukan-pribadi tidak tersentuh", () => {
    const h = redactCustomer(baris, false);
    assert.equal(h.name, "Ni Made Darmini");
    assert.equal(h.address, "Br. Dinas Sadimara");
    assert.equal(h.id, "c1");
  });

  test("tidak mengubah baris aslinya", () => {
    const salinan = { ...baris };
    redactCustomer(baris, false);
    assert.deepEqual(baris, salinan);
  });

  test("baris tanpa bidang pribadi sama sekali tidak menumbuhkan bidang baru", () => {
    // Anotasinya eksplisit: tanpa itu TypeScript menolak objek yang tidak
    // punya satu pun bidang PiiPelanggan (weak type detection). Bentuk ini
    // nyata — query yang hanya memilih id dan nama menghasilkannya.
    const ringkas: PiiPelanggan & { id: string; name: string } = { id: "c2", name: "PT Contoh" };
    const h = redactCustomer(ringkas, false);
    assert.deepEqual(Object.keys(h).sort(), ["id", "name"]);
  });
});

describe("redactCustomers", () => {
  test("menyamarkan seluruh baris dalam daftar", () => {
    const rows = [
      { id: "a", identityNumber: NIK, phone: "081236023387" },
      { id: "b", identityNumber: "5107054706800001", phone: "081246864899" },
    ];
    const h = redactCustomers(rows, false);
    assert.ok(h.every((r) => r.identityNumber!.includes("•")));
    assert.ok(h.every((r) => r.phone!.startsWith("•")));
  });

  test("dengan izin: daftar dikembalikan utuh", () => {
    const rows = [{ id: "a", identityNumber: NIK, phone: "081236023387" }];
    assert.equal(redactCustomers(rows, true)[0].identityNumber, NIK);
  });
});
