"use client";

import { useState } from "react";
import { APPROVAL_MODULES } from "@/lib/constants";

const MANUAL_MODULES = APPROVAL_MODULES.filter((m) => m.manual !== false);

export function ModuleSelect() {
  const [moduleCode, setModuleCode] = useState(MANUAL_MODULES[0].code);
  const subtypes =
    MANUAL_MODULES.find((m) => m.code === moduleCode)?.subtypes ?? [];

  return (
    <>
      <div>
        <label className="label" htmlFor="module">
          Modul
        </label>
        <select
          id="module"
          name="module"
          className="input"
          value={moduleCode}
          onChange={(e) => setModuleCode(e.target.value)}
        >
          {MANUAL_MODULES.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {subtypes.length > 0 && (
        <div>
          <label className="label" htmlFor="subtype">
            Subtipe
          </label>
          <select id="subtype" name="subtype" className="input">
            {subtypes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
