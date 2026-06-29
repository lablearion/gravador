"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";

// Entrada de pills/chips (DEC-014, onboarding/taxonomia). Cada item adicionado vira uma pill removível.
// Mantém um <input hidden name=...> com os valores juntos por vírgula → o contrato da server action
// (fd.get(name).split(",")) continua igual. `staticChips` são apenas exibidos (ex.: "Todas", tags do sistema).
export function ChipsInput({
  name,
  placeholder,
  staticChips,
}: {
  name: string;
  placeholder?: string;
  staticChips?: string[];
}) {
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!chips.includes(v) && !staticChips?.includes(v)) setChips([...chips, v]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {(staticChips?.length || chips.length) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {staticChips?.map((c) => (
            <span
              key={`s-${c}`}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
            >
              {c}
              <button
                type="button"
                onClick={() => setChips(chips.filter((x) => x !== c))}
                aria-label={`Remover ${c}`}
                className="rounded-full opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-dashed border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Adicionar"
          className="flex items-center justify-center rounded-lg border border-border px-3 transition-colors hover:bg-accent/40"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <input type="hidden" name={name} value={chips.join(",")} />
    </div>
  );
}
