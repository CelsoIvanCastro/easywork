"use server";
import * as c from "@/server/services/companies";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/solicitudes`;

export const approveAction: A = async (_, f) => run(async () => c.approveJoinRequest(await ctx(f), String(f.get("id")), fd(f)), "Solicitud aprobada. La persona entra sin permisos adicionales.", path(f));
export const rejectAction: A = async (_, f) => run(async () => c.rejectJoinRequest(await ctx(f), String(f.get("id")), String(f.get("note") ?? "")), "Solicitud rechazada.", path(f));
