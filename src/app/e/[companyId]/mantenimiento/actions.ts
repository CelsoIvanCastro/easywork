"use server";
import * as m from "@/server/services/maintenance";
import * as docs from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const asset = (f: FormData) => `/e/${f.get("c")}/activos/${f.get("assetId")}`;
const rec = (f: FormData) => `/e/${f.get("c")}/mantenimiento/${f.get("id")}`;

export const readingAction: A = async (_, f) => run(async () => m.recordReading(await ctx(f), String(f.get("assetId")), fd(f)), "Lectura registrada.", asset(f));
export const planAction: A = async (_, f) => run(async () => m.createPlan(await ctx(f), String(f.get("assetId")), fd(f)), "Plan creado.", asset(f));
export const planActiveAction: A = async (_, f) => run(async () => m.setPlanActive(await ctx(f), String(f.get("planId")), f.get("active") === "1"), "Plan actualizado.", asset(f));
export const recordAction: A = async (_, f) => run(async () => m.createRecord(await ctx(f), String(f.get("assetId")), fd(f)), "Mantenimiento registrado.", asset(f));
export const startAction: A = async (_, f) => run(async () => m.startRecord(await ctx(f), String(f.get("id"))), "Trabajo iniciado; el activo quedó en mantenimiento.", rec(f));
export const completeAction: A = async (_, f) => run(async () => m.completeRecord(await ctx(f), String(f.get("id")), fd(f)), "Mantenimiento completado y plan recalculado.", rec(f));
export const cancelAction: A = async (_, f) => run(async () => m.cancelRecord(await ctx(f), String(f.get("id"))), "Mantenimiento cancelado.", rec(f));
export const maintDocAction: A = async (_, f) =>
  run(async () => docs.uploadDocument(await ctx(f), { ...fd(f), maintenanceId: String(f.get("id")) }, f.get("file") as File), "Documento subido.", rec(f));
