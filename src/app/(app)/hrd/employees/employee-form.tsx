"use client";

import Link from "next/link";
import { useState } from "react";
import { EMPLOYEE_TYPES, WORK_PATTERNS, JOB_LEVELS, CONTRACTED_EMPLOYEE_TYPES } from "@/lib/constants";
import { saveEmployeeAction } from "../actions";

// Blok masa kontrak MUNCUL DAN HILANG mengikuti jenis kepegawaian — bukan
// sekadar dinonaktifkan. Field yang tampak tapi mati mengundang orang mengisi
// tanggal pada karyawan tetap, dan tanggal itulah yang dipakai penyapu Fase 42
// untuk membekukan akun.
//
// Klien hanya menyembunyikan; yang menolak tetap contractRejection() di
// service layer. Ini lapisan kenyamanan, bukan lapisan aturan.

export interface EmployeeFormRow {
  id: string;
  employeeNo: string;
  fullName: string;
  jobTitle: string | null;
  employeeType: string;
  supervisorId: string | null;
  userId: string | null;
  joinedAt: string; // yyyy-mm-dd
  isActive: boolean;
  address: string | null;
  workPattern: string;
  jobLevel: string;
  contractStartAt: string | null; // yyyy-mm-dd
  contractEndAt: string | null;
}

export function EmployeeForm({
  editRow,
  employees,
  users,
}: {
  editRow: EmployeeFormRow | null;
  employees: { id: string; fullName: string }[];
  users: { id: string; username: string; name: string }[];
}) {
  const [employeeType, setEmployeeType] = useState(editRow?.employeeType ?? "FULL_TIME");
  const showContract = (CONTRACTED_EMPLOYEE_TYPES as readonly string[]).includes(employeeType);

  return (
    <form action={saveEmployeeAction} className="space-y-3">
      {editRow && <input type="hidden" name="id" value={editRow.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="employeeNo">NIK</label>
          <input id="employeeNo" name="employeeNo" className="input" required defaultValue={editRow?.employeeNo ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="employeeType">Status Kepegawaian</label>
          <select
            id="employeeType"
            name="employeeType"
            className="input"
            value={employeeType}
            onChange={(e) => setEmployeeType(e.target.value)}
          >
            {EMPLOYEE_TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="fullName">Nama Lengkap</label>
        <input id="fullName" name="fullName" className="input" required defaultValue={editRow?.fullName ?? ""} />
      </div>

      <div>
        <label className="label" htmlFor="jobTitle">Jabatan</label>
        <input id="jobTitle" name="jobTitle" className="input" defaultValue={editRow?.jobTitle ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="jobLevel">Jenjang Jabatan</label>
          <select id="jobLevel" name="jobLevel" className="input" defaultValue={editRow?.jobLevel ?? "STAFF"}>
            {JOB_LEVELS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="workPattern">Pola Kerja</label>
          <select id="workPattern" name="workPattern" className="input" defaultValue={editRow?.workPattern ?? "NON_SHIFT"}>
            {WORK_PATTERNS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="address">Alamat</label>
        <textarea id="address" name="address" rows={2} className="input" defaultValue={editRow?.address ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="supervisorId">Atasan</label>
          <select id="supervisorId" name="supervisorId" className="input" defaultValue={editRow?.supervisorId ?? ""}>
            <option value="">— tidak ada —</option>
            {employees.filter((e) => e.id !== editRow?.id).map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="userId">Akun Sistem</label>
          <select id="userId" name="userId" className="input" defaultValue={editRow?.userId ?? ""}>
            <option value="">— belum tertaut —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username} · {u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="joinedAt">Tanggal Bergabung</label>
        <input id="joinedAt" name="joinedAt" type="date" className="input" required defaultValue={editRow?.joinedAt ?? ""} />
      </div>

      {showContract && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 text-xs font-medium text-amber-900">Masa Kontrak</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="contractStartAt">Mulai</label>
              <input
                id="contractStartAt"
                name="contractStartAt"
                type="date"
                className="input"
                defaultValue={editRow?.contractStartAt ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="contractEndAt">Berakhir</label>
              <input
                id="contractEndAt"
                name="contractEndAt"
                type="date"
                className="input"
                defaultValue={editRow?.contractEndAt ?? ""}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
            Akun akan dibekukan otomatis saat kontrak berakhir. HRD diperingatkan
            H-30 dan H-7 lebih dulu, dan pembekuan bisa dicairkan kembali.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
        Aktif
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
        {editRow && <Link href="/hrd/employees" className="btn-secondary">Batal</Link>}
      </div>
    </form>
  );
}
