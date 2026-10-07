// Errores con mensaje comprensible para la persona usuaria. Nunca incluyen trazas ni datos internos.
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMIT" | "REAUTH" | "UNAVAILABLE";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "El registro") => new AppError("NOT_FOUND", `${what} no existe o no tienes acceso.`);
export const forbidden = (msg = "No tienes permiso para realizar esta acción.") => new AppError("FORBIDDEN", msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);
export const conflict = (msg = "El registro cambió mientras lo editabas. Recarga y vuelve a intentarlo.") => new AppError("CONFLICT", msg);

// Mapea errores conocidos de base de datos sin filtrar detalles.
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const code = (e as { code?: string })?.code;
  if (code === "P2002") return new AppError("CONFLICT", "Ya existe un registro con esos datos.");
  if (code === "P2025") return notFound();
  if (code === "P2003") return invalid("Una referencia no es válida para esta empresa.");
  console.error("[error interno]", e instanceof Error ? e.message : e);
  return new AppError("UNAVAILABLE", "Ocurrió un error inesperado. Inténtalo de nuevo.");
}
