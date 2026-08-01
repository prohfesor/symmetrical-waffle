import { Formula } from "@pcad/core";
import React, { useState } from "react";

export interface FormulaInputProps {
  label: string;
  value: Formula;
  resolvedValue?: number;
  onChange: (value: Formula) => void;
}

function toEditString(v: Formula): string {
  return typeof v === "number" ? String(v) : v.startsWith("=") ? v : `=${v}`;
}

function parseInput(raw: string): Formula {
  const trimmed = raw.trim();
  if (trimmed.startsWith("=")) return trimmed;
  const n = Number(trimmed);
  if (trimmed.length > 0 && Number.isFinite(n)) return n;
  return trimmed.length === 0 ? 0 : `=${trimmed}`;
}

export function FormulaInput({ label, value, resolvedValue, onChange }: FormulaInputProps) {
  const [text, setText] = useState(toEditString(value));

  React.useEffect(() => {
    setText(toEditString(value));
  }, [value]);

  function commit() {
    onChange(parseInput(text));
  }

  return (
    <label className="formula-field">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {resolvedValue !== undefined && <span className="resolved-hint">= {Number(resolvedValue.toFixed(4))}</span>}
    </label>
  );
}
