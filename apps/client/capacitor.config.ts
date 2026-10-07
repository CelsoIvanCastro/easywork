import type { CapacitorConfig } from "@capacitor/cli";

// Identificador PROVISIONAL: confirmar antes de la primera subida a tiendas (no se puede cambiar después).
const config: CapacitorConfig = {
  appId: process.env.APP_ID ?? "com.celsocastro.easywork",
  appName: "EasyWork",
  webDir: "dist",
  // Sin server.url: la app empaqueta el cliente y habla con la API remota por HTTPS.
  android: { allowMixedContent: false, captureInput: true },
  ios: { contentInset: "automatic", limitsNavigationsToAppBoundDomains: false },
  plugins: { SecureStorage: {} },
};

export default config;
