"use server";
import * as s from "@/server/services/structure";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/estructura`;
const idOrNull = (f: FormData) => (f.get("id") ? String(f.get("id")) : null);

export const saveDeptAction: A = async (_, f) => run(async () => s.saveDepartment(await ctx(f), idOrNull(f), fd(f), Number(f.get("version"))), "Departamento guardado.", path(f));
export const archiveDeptAction: A = async (_, f) => run(async () => s.archiveDepartment(await ctx(f), String(f.get("id"))), "Departamento archivado.", path(f));
export const savePosAction: A = async (_, f) => run(async () => s.savePosition(await ctx(f), idOrNull(f), fd(f), Number(f.get("version"))), "Puesto guardado.", path(f));
export const archivePosAction: A = async (_, f) => run(async () => s.archivePosition(await ctx(f), String(f.get("id"))), "Puesto archivado.", path(f));
