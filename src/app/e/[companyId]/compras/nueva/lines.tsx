"use client";
import { useState } from "react";

type Opt = [string, string];
type Line = { kind: "STOCK" | "ASSET" | "SERVICE"; itemId: string; categoryId: string; description: string; quantity: string; unitPrice: string };
const empty = (): Line => ({ kind: "STOCK", itemId: "", categoryId: "", description: "", quantity: "1", unitPrice: "" });

/** Editor de líneas. Solo arma los datos; importes y totales los calcula el servidor con decimales exactos. */
export function LinesEditor({ items, assetCats }: { items: Opt[]; assetCats: Opt[] }) {
  const [lines, setLines] = useState<Line[]>([empty()]);
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset>
      <legend>Líneas</legend>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      {lines.map((l, i) => (
        <div key={i} className="card fields">
          <label>Tipo
            <select value={l.kind} onChange={(e) => set(i, { kind: e.target.value as Line["kind"] })}>
              <option value="STOCK">Artículo de inventario</option>
              <option value="ASSET">Activo individual</option>
              <option value="SERVICE">Servicio</option>
            </select>
          </label>
          {l.kind === "STOCK" && (
            <label>Artículo
              <select value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value })} required>
                <option value="">Elige…</option>
                {items.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
          )}
          {l.kind === "ASSET" && (
            <label>Categoría del activo
              <select value={l.categoryId} onChange={(e) => set(i, { categoryId: e.target.value })} required>
                <option value="">Elige…</option>
                {assetCats.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
          )}
          <label>Descripción<input value={l.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={200} required={l.kind !== "STOCK"} /></label>
          <label>Cantidad<input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" required /></label>
          <label>Precio unitario<input value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} inputMode="decimal" required /></label>
          {lines.length > 1 && <div className="row"><button type="button" className="secondary" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Quitar línea</button></div>}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => setLines([...lines, empty()])}>+ Agregar línea</button>
    </fieldset>
  );
}
