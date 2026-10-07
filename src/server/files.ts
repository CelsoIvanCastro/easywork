import "server-only";
import { createHash } from "node:crypto";
import { Socket } from "node:net";
import { fileTypeFromBuffer } from "file-type";
import { env } from "./env";
import { invalid } from "./errors";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export type ProcessedFile = { data: Buffer; mime: string; size: number; sha256: string; originalName: string; scan: "CLEAN" | "UNSCANNED" | "PENDING" };

/** Valida por contenido real (firma), tamaño y extensión; limpia metadatos de imágenes; analiza si hay analizador. */
export async function processUpload(file: File | null | undefined): Promise<ProcessedFile> {
  if (!file || typeof file === "string" || file.size === 0) throw invalid("Selecciona un archivo.", { file: "Requerido" });
  if (file.size > MAX_FILE_BYTES) throw invalid("El archivo supera 10 MB.", { file: "Máximo 10 MB" });
  let data: Buffer = Buffer.from(await file.arrayBuffer());
  const type = await fileTypeFromBuffer(data);
  if (!type || !ALLOWED[type.mime]) throw invalid("Formato no admitido. Usa PDF, JPG, PNG o WEBP.", { file: "Formato no admitido" });
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (ext && !ALLOWED[type.mime].includes(ext)) throw invalid("La extensión no coincide con el contenido del archivo.", { file: "Extensión no coincide" });
  if (type.mime.startsWith("image/")) {
    // Re-codificar elimina EXIF/GPS y otros metadatos; rotate() aplica la orientación antes de descartarla.
    const sharp = (await import("sharp")).default;
    try {
      data = await sharp(data, { limitInputPixels: 50_000_000 }).rotate().toFormat(type.ext as "jpeg" | "png" | "webp").toBuffer();
    } catch {
      throw invalid("La imagen está dañada o no se puede procesar.", { file: "Imagen inválida" });
    }
  }
  const scan = await scanBuffer(data);
  const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || `archivo.${type.ext}`;
  return { data, mime: type.mime, size: data.length, sha256: createHash("sha256").update(data).digest("hex"), originalName: safeName, scan };
}

/**
 * Análisis antimalware. FILE_SCAN=clamav usa clamd (INSTREAM). Sin analizador:
 * - FILE_SCAN_REQUIRED=false (desarrollo): UNSCANNED, visible en la interfaz.
 * - FILE_SCAN_REQUIRED=true (producción): PENDING = cuarentena; no se entrega hasta que el worker lo analice.
 */
export async function scanBuffer(data: Buffer): Promise<"CLEAN" | "UNSCANNED" | "PENDING"> {
  if (env.fileScan !== "clamav") return env.fileScanRequired ? "PENDING" : "UNSCANNED";
  try {
    const result = await clamdScan(data);
    if (result === "INFECTED") throw invalid("El archivo fue rechazado por el análisis antimalware.", { file: "Rechazado" });
    return "CLEAN";
  } catch (e) {
    if ((e as { code?: string }).code === "VALIDATION") throw e;
    return env.fileScanRequired ? "PENDING" : "UNSCANNED";
  }
}

export function clamdScan(data: Buffer): Promise<"CLEAN" | "INFECTED"> {
  return new Promise((resolve, reject) => {
    const s = new Socket();
    let out = "";
    s.setTimeout(15000, () => s.destroy(new Error("clamd timeout")));
    s.connect(Number(process.env.CLAMAV_PORT ?? 3310), process.env.CLAMAV_HOST ?? "127.0.0.1", () => {
      s.write("zINSTREAM\0");
      for (let i = 0; i < data.length; i += 64 * 1024) {
        const chunk = data.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        s.write(len);
        s.write(chunk);
      }
      s.write(Buffer.alloc(4));
    });
    s.on("data", (d) => (out += d.toString()));
    s.on("end", () => (out.includes("FOUND") ? resolve("INFECTED") : out.includes("OK") ? resolve("CLEAN") : reject(new Error(out))));
    s.on("error", reject);
  });
}
