"use server";
import { redirect } from "next/navigation";
import * as inv from "@/server/services/inventory";
import * as docs from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const c = (f: FormData) => `/e/${f.get("c")}`;

export const suggestedAction: A = async (_, f) => run(async () => inv.activateSuggested(await ctx(f), String(f.get("key"))), "Categoría activada.", `${c(f)}/inventario`);
export const categoryAction: A = async (_, f) => run(async () => inv.createCategory(await ctx(f), fd(f)), "Categoría creada.", `${c(f)}/inventario`);
export const categoryUpdateAction: A = async (_, f) => run(async () => inv.updateCategory(await ctx(f), String(f.get("id")), fd(f)), "Categoría actualizada.", `${c(f)}/inventario`);
export const categoryRemoveAction: A = async (_, f) =>
  run(async () => inv.archiveOrDeleteCategory(await ctx(f), String(f.get("id")), f.get("mode") === "delete" ? "delete" : "archive"), "Categoría actualizada.", `${c(f)}/inventario`);
export const itemAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await inv.createItem(await ctx(f), fd(f))).id;
  });
  if (r.ok) redirect(`${c(f)}/inventario/${id}`);
  return r;
};
export const itemUpdateAction: A = async (_, f) => run(async () => inv.updateItem(await ctx(f), String(f.get("id")), fd(f), Number(f.get("version"))), "Artículo guardado.", `${c(f)}/inventario/${f.get("id")}`);
export const itemArchiveAction: A = async (_, f) => run(async () => inv.setItemArchived(await ctx(f), String(f.get("id")), f.get("archived") === "1"), "Actualizado.", `${c(f)}/inventario/${f.get("id")}`);
export const moveAction: A = async (_, f) =>
  run(async () => {
    const r = await inv.recordMovement(await ctx(f), String(f.get("id")), fd(f));
    if (r.duplicate) return { duplicate: true };
  }, "Movimiento registrado.", `${c(f)}/inventario/${f.get("id")}`);
export const reverseMoveAction: A = async (_, f) => run(async () => inv.reverseMovement(await ctx(f), String(f.get("movementId")), String(f.get("reason") ?? "")), "Movimiento compensado.", `${c(f)}/inventario/${f.get("id")}`);

export const assetAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await inv.createAsset(await ctx(f), fd(f))).id;
  });
  if (r.ok) redirect(`${c(f)}/activos/${id}`);
  return r;
};
export const assetUpdateAction: A = async (_, f) => run(async () => inv.updateAsset(await ctx(f), String(f.get("id")), fd(f), Number(f.get("version"))), "Activo guardado.", `${c(f)}/activos/${f.get("id")}`);
export const assetStatusAction: A = async (_, f) => run(async () => inv.changeAssetStatus(await ctx(f), String(f.get("id")), fd(f)), "Estado actualizado.", `${c(f)}/activos/${f.get("id")}`);
export const assetDocAction: A = async (_, f) =>
  run(async () => docs.uploadDocument(await ctx(f), { ...fd(f), assetId: String(f.get("id")) }, f.get("file") as File), "Documento subido.", `${c(f)}/activos/${f.get("id")}`);
