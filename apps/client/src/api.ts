import { API_URL } from "./config";
import { tokenStore } from "./platform";
import type { ApiError } from "@shared/api-contract";

export class ApiFailure extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
  }
}
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth !== false) {
    const t = await tokenStore.get();
    if (t) headers.set("authorization", `Bearer ${t}`);
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers, credentials: "omit", cache: "no-store" });
  } catch {
    throw new ApiFailure(0, { code: "OFFLINE", message: "Sin conexión. Revisa tu red e inténtalo de nuevo." });
  }
  if (res.status === 401 && init.auth !== false) {
    await tokenStore.clear();
    onUnauthorized();
  }
  return res;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({ error: { code: "UNAVAILABLE", message: "Respuesta inválida del servidor." } }));
  if (!res.ok || body.error) throw new ApiFailure(res.status, body.error ?? { code: "UNAVAILABLE", message: "Error del servidor." });
  return body.data as T;
}

export const rpc = <T = unknown>(op: string, input?: unknown, companyId?: string) =>
  request("/api/v1/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, companyId, input }) }).then(unwrap<T>);

export const authCall = <T = unknown>(action: "login" | "2fa" | "logout" | "forgot", body: unknown) =>
  request(`/api/v1/auth/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), auth: action === "logout" }).then(unwrap<T>);

export const upload = (form: FormData) => request("/api/v1/upload", { method: "POST", body: form }).then(unwrap<{ id?: string; version?: number }>);

export async function fetchFile(companyId: string, versionId: string, download: boolean) {
  const res = await request(`/api/archivos/${companyId}/${versionId}${download ? "?modo=descargar" : ""}`);
  if (!res.ok) throw new ApiFailure(res.status, { code: "FILE", message: (await res.text()) || "No se pudo abrir el archivo." });
  return res.blob();
}

/** Clave de idempotencia para operaciones que no deben duplicarse en reintentos. */
export const idemKey = () => crypto.randomUUID();

/** Registro dentro de la app (Better Auth). La verificación llega por correo. */
export async function signUp(body: { name: string; lastName: string; email: string; phone: string; password: string; acceptTerms: boolean }) {
  let res: Response;
  try {
    res = await fetch(API_URL + "/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, callbackURL: "/empresas" }), credentials: "omit" });
  } catch {
    throw new ApiFailure(0, { code: "OFFLINE", message: "Sin conexión. Revisa tu red e inténtalo de nuevo." });
  }
  if (res.status === 429) throw new ApiFailure(429, { code: "RATE_LIMIT", message: "Demasiados intentos. Espera unos minutos." });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const code = j?.code as string | undefined;
    const msg = code === "PASSWORD_TOO_SHORT" ? "La contraseña debe tener al menos 10 caracteres." : j?.message?.includes("términos") ? j.message : "No se pudo crear la cuenta con esos datos.";
    throw new ApiFailure(res.status, { code: "VALIDATION", message: msg });
  }
}
