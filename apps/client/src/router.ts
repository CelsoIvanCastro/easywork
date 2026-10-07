import { useEffect, useState } from "react";

// Enrutado por hash: funciona con archivos locales (Capacitor/Tauri) y con el botón "atrás" del sistema.
export type Route = { path: string[]; query: URLSearchParams };
const parse = (): Route => {
  const [p, q] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { path: p ? p.split("/").filter(Boolean).map(decodeURIComponent) : [], query: new URLSearchParams(q ?? "") };
};
export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
export const go = (path: string) => {
  window.location.hash = "#/" + path.replace(/^\//, "");
};
export const href = (path: string) => "#/" + path.replace(/^\//, "");
