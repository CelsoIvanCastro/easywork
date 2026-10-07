import { Capacitor } from "@capacitor/core";

export const isCapacitor = Capacitor.isNativePlatform();
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const platformName = isCapacitor ? Capacitor.getPlatform() : isTauri ? "desktop" : "web";

/**
 * Almacén del token de sesión:
 * - iOS/Android: Llavero / Keystore (@aparajita/capacitor-secure-storage).
 * - Escritorio: almacén de credenciales del sistema vía comandos Tauri (crate keyring).
 * - Vista previa en navegador (solo desarrollo): sessionStorage, se borra al cerrar la pestaña.
 */
const KEY = "easywork.session";
export const tokenStore = {
  async get(): Promise<string | null> {
    if (isCapacitor) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      return ((await SecureStorage.get(KEY).catch(() => null)) as string | null) ?? null;
    }
    if (isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("token_get");
    }
    return sessionStorage.getItem(KEY);
  },
  async set(token: string) {
    if (isCapacitor) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      await SecureStorage.set(KEY, token, true, false);
    } else if (isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("token_set", { token });
    } else sessionStorage.setItem(KEY, token);
  },
  async clear() {
    if (isCapacitor) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      await SecureStorage.remove(KEY).catch(() => {});
    } else if (isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("token_clear");
    } else sessionStorage.removeItem(KEY);
  },
};

/** Abrir enlaces externos en el navegador del sistema (nunca dentro de la app). */
export async function openExternal(url: string) {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("open_external", { url });
  }
  if (!window.open(url, "_blank", "noopener,noreferrer")) throw new Error("bloqueado");
}

/** Guardar/abrir un archivo autorizado. En móvil se escribe en caché y se comparte; luego se elimina. */
export async function openBlob(blob: Blob, name: string) {
  if (isCapacitor) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.readAsDataURL(blob);
    });
    const path = `easywork-${Date.now()}-${name.replace(/[^\w.-]/g, "_")}`;
    const f = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
    try {
      await Share.share({ title: name, url: f.uri });
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Foto desde cámara o selector del sistema (pide permiso solo al usarlo). */
export async function pickPhoto(source: "camera" | "photos"): Promise<File | null> {
  if (!isCapacitor) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const p = await Camera.getPhoto({ resultType: CameraResultType.Uri, source: source === "camera" ? CameraSource.Camera : CameraSource.Photos, quality: 85, correctOrientation: true });
    const blob = await (await fetch(p.webPath!)).blob();
    return new File([blob], `foto-${Date.now()}.${p.format === "png" ? "png" : "jpg"}`, { type: blob.type || "image/jpeg" });
  } catch {
    return null; // cancelado o permiso denegado: la UI ofrece el selector de archivos como alternativa
  }
}
