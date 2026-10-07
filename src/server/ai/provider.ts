import "server-only";

// Adaptador de proveedor de IA. El servidor lo configura de forma explícita por variables de entorno;
// nunca se reutilizan credenciales personales ni de Claude Code. Las claves no salen del servidor.

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ChatMessage =
  | { role: "user"; content: string | ToolResultBlock[] }
  | { role: "assistant"; content: string | AssistantBlock[] };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  // Otros bloques del proveedor (razonamiento, cambios de modelo): se reenvían intactos.
  | { type: "other"; [k: string]: unknown };
export type ModelTurn = { blocks: AssistantBlock[]; stop: "end" | "tool_use" | "max_tokens" | "refusal" | "other"; inputTokens: number; outputTokens: number };

export interface AiProvider {
  name: string;
  turn(system: string, messages: ChatMessage[], tools: ToolDef[], signal: AbortSignal): Promise<ModelTurn>;
}

export class AiUnavailable extends Error {}

const cfg = () => ({
  provider: (process.env.AI_PROVIDER ?? "none") as "none" | "anthropic" | "openai-compatible",
  model: process.env.AI_MODEL ?? "",
  baseUrl: process.env.AI_BASE_URL ?? "",
  key: process.env.AI_API_KEY ?? "",
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60000),
  maxOutput: 1024,
});

export function providerInfo() {
  const c = cfg();
  const configured = c.provider !== "none" && !!c.model && (c.provider === "openai-compatible" ? !!c.baseUrl : !!c.key);
  return { configured, provider: c.provider, model: c.model, timeoutMs: c.timeoutMs };
}

/**
 * Anthropic mediante el SDK oficial. Los bloques del asistente (incluido el razonamiento) se devuelven
 * sin modificar en el siguiente turno, como exige el modelo. Activa el respaldo del servidor ante rechazos.
 */
class Anthropic implements AiProvider {
  name = "anthropic";
  async turn(system: string, messages: ChatMessage[], tools: ToolDef[], signal: AbortSignal): Promise<ModelTurn> {
    const c = cfg();
    const { default: SDK } = await import("@anthropic-ai/sdk");
    const client = new SDK({ apiKey: c.key, ...(c.baseUrl ? { baseURL: c.baseUrl } : {}), maxRetries: 1 });
    let r;
    try {
      r = await client.beta.messages.create(
        {
          model: c.model,
          max_tokens: 16000,
          system,
          messages: messages as never,
          tools: tools as never,
          output_config: { effort: "medium" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as never,
        { signal, timeout: c.timeoutMs },
      );
    } catch (e) {
      if (e instanceof SDK.APIError) throw new AiUnavailable(`Proveedor respondió ${e.status ?? "sin estado"}`);
      throw e;
    }
    const msg = r as unknown as { content: AssistantBlock[]; stop_reason: string; usage?: { input_tokens: number; output_tokens: number } };
    return {
      blocks: msg.content,
      stop: msg.stop_reason === "tool_use" ? "tool_use" : msg.stop_reason === "end_turn" ? "end" : msg.stop_reason === "max_tokens" ? "max_tokens" : msg.stop_reason === "refusal" ? "refusal" : "other",
      inputTokens: msg.usage?.input_tokens ?? 0,
      outputTokens: msg.usage?.output_tokens ?? 0,
    };
  }
}

/** Servidores compatibles con la API de chat completions (p. ej. un modelo local que el usuario configure). */
class OpenAICompatible implements AiProvider {
  name = "openai-compatible";
  async turn(system: string, messages: ChatMessage[], tools: ToolDef[], signal: AbortSignal): Promise<ModelTurn> {
    const c = cfg();
    const msgs: unknown[] = [{ role: "system", content: system }];
    for (const m of messages) {
      if (typeof m.content === "string") msgs.push({ role: m.role, content: m.content });
      else if (m.role === "assistant") {
        const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
        const calls = m.content.filter((b) => b.type === "tool_use") as Extract<AssistantBlock, { type: "tool_use" }>[];
        msgs.push({ role: "assistant", content: text || null, tool_calls: calls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input) } })) });
      } else for (const b of m.content) msgs.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
    }
    const r = await fetch(`${c.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...(c.key ? { authorization: `Bearer ${c.key}` } : {}) },
      body: JSON.stringify({
        model: c.model,
        max_tokens: c.maxOutput,
        messages: msgs,
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
    });
    if (!r.ok) throw new AiUnavailable(`Proveedor respondió ${r.status}`);
    const j = (await r.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = j.choices[0].message;
    const blocks: AssistantBlock[] = [];
    if (msg.content) blocks.push({ type: "text", text: msg.content });
    for (const t of msg.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(t.function.arguments || "{}");
      } catch {
        input = {};
      }
      blocks.push({ type: "tool_use", id: t.id, name: t.function.name, input });
    }
    return {
      blocks,
      stop: msg.tool_calls?.length ? "tool_use" : j.choices[0].finish_reason === "length" ? "max_tokens" : "end",
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
    };
  }
}

export function getProvider(): AiProvider {
  const info = providerInfo();
  if (!info.configured) throw new AiUnavailable("IA no configurada");
  return info.provider === "anthropic" ? new Anthropic() : new OpenAICompatible();
}
