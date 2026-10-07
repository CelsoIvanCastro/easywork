"use server";
import { redirect } from "next/navigation";
import * as employees from "@/server/services/employees";
import * as docs from "@/server/services/documents";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctxOf = (f: FormData) => getCtx(String(f.get("c")));
const base = (f: FormData) => `/e/${f.get("c")}/personal/${f.get("id")}`;
const ver = (f: FormData) => Number(f.get("version"));

export const createEmployeeAction: A = async (_, f) => {
  let id = "";
  const r = await run(async () => {
    id = (await employees.createEmployee(await ctxOf(f), fd(f)))!.id;
  });
  if (r.ok) redirect(`/e/${f.get("c")}/personal/${id}`);
  return r;
};
export const updateBasicAction: A = async (_, f) => run(async () => employees.updateBasic(await ctxOf(f), String(f.get("id")), fd(f), ver(f)), "Datos guardados.", base(f));
export const updatePersonalAction: A = async (_, f) => run(async () => employees.updatePersonal(await ctxOf(f), String(f.get("id")), fd(f), ver(f)), "Datos personales guardados.", base(f));
export const assignmentAction: A = async (_, f) => run(async () => employees.changeAssignment(await ctxOf(f), String(f.get("id")), fd(f)), "Puesto actualizado con historial.", base(f));
export const bankAction: A = async (_, f) =>
  run(async () => employees.setBankAccount(await ctxOf(f), String(f.get("id")), fd(f)), "CLABE guardada. Estructura válida; la titularidad no se verifica con el banco.", base(f));
export const revealAction: A = async (_, f) => run(async () => employees.revealClabe(await ctxOf(f), String(f.get("bankId"))), "CLABE mostrada (acceso registrado en auditoría).");
export const noteAction: A = async (_, f) => run(async () => employees.addNote(await ctxOf(f), String(f.get("id")), fd(f)), "Nota registrada.", base(f));
export const contractAction: A = async (_, f) => run(async () => employees.addContract(await ctxOf(f), String(f.get("id")), fd(f)), "Contrato registrado.", base(f));
export const statusAction: A = async (_, f) => run(async () => employees.setStatus(await ctxOf(f), String(f.get("id")), String(f.get("status")) as never), "Estado actualizado.", base(f));
export const terminateAction: A = async (_, f) =>
  run(async () => {
    const ctx = await ctxOf(f);
    const id = String(f.get("id"));
    await employees.terminate(ctx, id, fd(f));
    const file = f.get("file") as File | null;
    if (file && file.size) await docs.uploadDocument(ctx, { title: "Documento de baja", docType: "OFFBOARDING", employeeId: id }, file);
  }, "Baja registrada. Se retiró su acceso a esta empresa y se conservó el expediente.", base(f));
export const rehireAction: A = async (_, f) => run(async () => employees.rehire(await ctxOf(f), String(f.get("id")), fd(f)), "Recontratación registrada como nuevo periodo.", base(f));
export const legalHoldAction: A = async (_, f) => run(async () => employees.setLegalHold(await ctxOf(f), String(f.get("id")), f.get("hold") === "on"), "Bloqueo de conservación actualizado.", base(f));
export const anonymizeAction: A = async (_, f) => run(async () => employees.anonymize(await ctxOf(f), String(f.get("id")), String(f.get("confirm") ?? "")), "Expediente anonimizado.", base(f));
export const uploadEmployeeDocAction: A = async (_, f) =>
  run(async () => docs.uploadDocument(await ctxOf(f), { ...fd(f), employeeId: String(f.get("id")) }, f.get("file") as File), "Documento subido.", base(f));
export const versionEmployeeDocAction: A = async (_, f) => run(async () => docs.addVersion(await ctxOf(f), String(f.get("docId")), f.get("file") as File), "Nueva versión guardada.", base(f));
