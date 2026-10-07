"use server";
import { redirect } from "next/navigation";
import * as d from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const docPath = (f: FormData) => `/e/${f.get("c")}/documentos/${f.get("id")}`;

export const uploadAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await d.uploadDocument(await ctx(f), fd(f), f.get("file") as File)).id;
  });
  if (r.ok) redirect(`/e/${f.get("c")}/documentos/${id}`);
  return r;
};
export const versionAction: A = async (_, f) => run(async () => d.addVersion(await ctx(f), String(f.get("id")), f.get("file") as File), "Nueva versión guardada.", docPath(f));
export const restoreAction: A = async (_, f) => run(async () => d.restoreVersion(await ctx(f), String(f.get("id")), Number(f.get("number"))), "Versión restaurada como vigente.", docPath(f));
export const archiveAction: A = async (_, f) => run(async () => d.setArchived(await ctx(f), String(f.get("id")), f.get("archived") === "1"), "Actualizado.", docPath(f));
export const moveAction: A = async (_, f) => run(async () => d.moveDocument(await ctx(f), String(f.get("id")), String(f.get("folderId") || "") || null), "Documento movido.", docPath(f));
export const confidentialAction: A = async (_, f) => run(async () => d.setConfidential(await ctx(f), String(f.get("id")), f.get("confidential") === "on"), "Confidencialidad actualizada.", docPath(f));
export const folderAction: A = async (_, f) => run(async () => d.createFolder(await ctx(f), fd(f)), "Carpeta creada.", `/e/${f.get("c")}/documentos`);
