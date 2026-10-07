// URL del servicio. En producción DEBE ser HTTPS; las apps nunca apuntan a localhost ni contienen secretos.
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";
export const WEB_URL: string = (import.meta.env.VITE_WEB_URL as string | undefined) ?? API_URL;
// VITE_INSECURE_TEST_BUILD solo para compilaciones de prueba contra un servidor local (emulador/simulador); nunca en release.
if (import.meta.env.PROD && !API_URL.startsWith("https://") && import.meta.env.VITE_INSECURE_TEST_BUILD !== "true") {
  // Compilación de producción sin HTTPS: se detiene en lugar de enviar credenciales sin cifrar.
  throw new Error("VITE_API_URL debe usar https en una compilación de producción");
}
