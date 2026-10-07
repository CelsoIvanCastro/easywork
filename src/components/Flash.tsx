"use client";
import { useEffect, useState } from "react";

/** Aviso del resultado de la última acción: se muestra unos segundos y se borra la cookie. */
export function Flash({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!message) return;
    document.cookie = "ew_flash=; path=/; max-age=0; samesite=lax";
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <p className="msg ok flash" role="status">
      {message}
    </p>
  );
}
