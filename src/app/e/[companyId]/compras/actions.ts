"use server";
import { redirect } from "next/navigation";
import * as p from "@/server/services/purchases";
import * as docs from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";
import { invalid } from "@/server/errors";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/compras/${f.get("id")}`;
const lines = (f: FormData) => {
  try {
    return JSON.parse(String(f.get("lines") ?? "[]"));
  } catch {
    throw invalid("Líneas inválidas.");
  }
};

export const createAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await p.createPurchase(await ctx(f), { ...fd(f), lines: lines(f) })).id;
  });
  if (r.ok) redirect(`/e/${f.get("c")}/compras/${id}`);
  return r;
};
export const confirmAction: A = async (_, f) => run(async () => p.confirmPurchase(await ctx(f), String(f.get("id"))), "Compra confirmada.", path(f));
export const cancelAction: A = async (_, f) => run(async () => p.cancelPurchase(await ctx(f), String(f.get("id"))), "Compra cancelada.", path(f));
export const receiveAction: A = async (_, f) =>
  run(async () => {
    const lineIds = f.getAll("lineId").map(String);
    const r = await p.receivePurchase(await ctx(f), String(f.get("id")), {
      idempotencyKey: f.get("idempotencyKey"),
      receivedOn: f.get("receivedOn"),
      notes: f.get("notes"),
      lines: lineIds.map((lineId) => ({
        lineId,
        quantity: String(f.get(`qty_${lineId}`) ?? ""),
        serials: String(f.get(`serials_${lineId}`) ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
      })),
    });
    if (r.duplicate) return { duplicate: true };
  }, "Recepción registrada.", path(f));
export const reverseAction: A = async (_, f) => run(async () => p.reverseReceipt(await ctx(f), String(f.get("receiptId")), String(f.get("reason") ?? "")), "Recepción revertida con movimientos compensatorios.", path(f));
export const docAction: A = async (_, f) => run(async () => docs.uploadDocument(await ctx(f), { ...fd(f), purchaseId: String(f.get("id")) }, f.get("file") as File), "Documento subido.", path(f));
