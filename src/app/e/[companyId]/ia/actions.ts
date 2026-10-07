"use server";
import { ask, type AiAnswer } from "@/server/ai/assistant";
import { getCtx } from "@/server/web";
import { AppError } from "@/server/errors";
import { ZodError } from "zod";

export async function askAction(companyId: string, question: string, history: { role: "user" | "assistant"; text: string }[]): Promise<AiAnswer> {
  try {
    return await ask(await getCtx(companyId), { question, history });
  } catch (e) {
    if (e instanceof ZodError) return { status: "limit", text: e.issues[0]?.message ?? "Pregunta inválida.", links: [], partial: false };
    if (e instanceof AppError) return { status: "limit", text: e.message, links: [], partial: false };
    throw e;
  }
}
