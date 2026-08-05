"use client";

import { useState } from "react";
import { APPROVAL_MODULES } from "@/lib/constants";

export function ModuleSelect() {
  const [moduleCode, setModuleCode] = useState(APPROVAL_MODULES[0].code);
  const subtypes =
    APPROVAL_MODULES.find((m) => m.code === moduleCode)?.subtypes ?? [];

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
          {APPROVAL_MODULES.map((m) => (
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
