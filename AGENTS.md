# Project Instructions

**Luna (OpenCode) = FRONTEND. Opus (Claude Code) = BACKEND, SERVER, DATABASE.**

Aturan lengkap, batas wilayah, alur per fase, dan peta seluruh aplikasi
PerumNet ada di **`docs/WORKFLOW-TIM.md`**. Baca itu sebelum mengubah apa pun.

- Permintaan Luna → Opus: `docs/PERMINTAAN-FRONTEND-KE-BACKEND.md`
- Kontrak Opus → Luna: `docs/HANDOFF-BACKEND-KE-FRONTEND.md`

---

- Gunakan `docs/PRD-PerumNet-CRM.md` sebagai sumber requirement utama.
- Prioritaskan MVP terlebih dahulu.
- Sistem harus menggunakan role-based access control.
- Stock dan saldo tidak boleh diedit langsung.
- Transaksi posted harus immutable.
- Semua perubahan sensitif harus memiliki audit log.
- Jangan menghapus atau menyederhanakan business rules tanpa persetujuan.
- Sebelum implementasi besar, jelaskan rencana perubahan dan file yang akan dibuat.