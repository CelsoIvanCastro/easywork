"use server";
import { redirect } from "next/navigation";
import * as s from "@/server/services/suppliers";
import * as docs from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/proveedores/${f.get("id")}`;

export const createAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await s.createSupplier(await ctx(f), fd(f))).id;
  });
  if (r.ok) redirect(`/e/${f.get("c")}/proveedores/${id}`);
  return r;
};
export const updateAction: A = async (_, f) => run(async () => s.updateSupplier(await ctx(f), String(f.get("id")), fd(f), Number(f.get("version"))), "Proveedor guardado.", path(f));
export const archiveAction: A = async (_, f) => run(async () => s.setSupplierArchived(await ctx(f), String(f.get("id")), f.get("archived") === "1"), "Actualizado. Sus compras se conservan.", path(f));
export const docAction: A = async (_, f) => run(async () => docs.uploadDocument(await ctx(f), { ...fd(f), supplierId: String(f.get("id")) }, f.get("file") as File), "Documento subido.", path(f));
