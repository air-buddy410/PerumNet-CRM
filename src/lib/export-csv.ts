// ── Export CSV (gap G22) ────────────────────────────────────────
// Sistem pembanding menyediakan Copy/Excel/PDF/CSV/Print di hampir setiap
// daftar. Kita mulai dari CSV karena itu yang paling banyak dipakai dan bisa
// dibuat TANPA dependensi — .xlsx dan PDF sungguhan butuh pustaka tersendiri,
// dan keputusan menambahnya diserahkan ke pemilik proyek.
//
// Dua hal yang ditangani serius di sini:
//
// 1. FORMULA INJECTION. Nilai yang diawali = + - @ (atau tab/CR) akan
//    dieksekusi Excel sebagai rumus saat berkas dibuka. Nama pelanggan yang
//    diisi "=cmd|..." berubah menjadi perintah di komputer orang lain. Nilai
//    seperti itu diberi awalan kutip tunggal sehingga tetap terbaca sebagai
//    teks. Ini bukan teori — ini cara berkas ekspor menjadi senjata.
//
// 2. BOM UTF-8. Tanpa byte-order mark, Excel di Windows membaca CSV sebagai
//    ANSI dan nama ber-aksen jadi rusak.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | bigint | Date | null | undefined;
}

const RISKY_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";

  let text: string;
  if (raw instanceof Date) {
    text = raw.toISOString().slice(0, 19).replace("T", " ");
  } else if (typeof raw === "bigint") {
    text = raw.toString();
  } else {
    text = String(raw);
  }

  // Netralkan formula sebelum quoting.
  if (RISKY_PREFIX.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => csvCell(c.value(row))).join(",")
  );
  // CRLF: pembaca CSV di Windows paling toleran terhadap ini.
  return [head, ...body].join("\r\n") + "\r\n";
}

/** Menyusun respons unduhan lengkap dengan BOM dan nama berkas bertanggal. */
export function csvResponse(filename: string, csv: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);
  const body = "﻿" + csv; // BOM agar Excel membaca UTF-8
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
