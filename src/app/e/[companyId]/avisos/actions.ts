"use server";
import * as a from "@/server/services/announcements";
import { getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/avisos`;
const body = (f: FormData) => ({ title: f.get("title"), body: f.get("body"), audience: f.get("audience"), departmentIds: f.getAll("departmentIds").map(String) });

export const publishAction: A = async (_, f) => run(async () => a.publish(await ctx(f), body(f)), "Aviso publicado.", path(f));
export const editAction: A = async (_, f) => run(async () => a.editAnnouncement(await ctx(f), String(f.get("id")), body(f), Number(f.get("version"))), "Aviso actualizado.", path(f));
export const archiveAction: A = async (_, f) => run(async () => a.archiveAnnouncement(await ctx(f), String(f.get("id"))), "Aviso archivado.", path(f));
