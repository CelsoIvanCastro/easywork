"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card" role="alert">
      <h1>No se pudo cargar</h1>
      <p>Ocurrió un problema al cargar esta sección. Puede que no tengas acceso o que el servicio no esté disponible.</p>
      <button onClick={reset}>Reintentar</button>
    </div>
  );
}
