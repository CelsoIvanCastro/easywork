import Link from "next/link";

export default function NoAccess() {
  return (
    <div className="card">
      <h1>No disponible</h1>
      <p>Esta página no existe, el módulo está desactivado o no tienes acceso a ella.</p>
      <Link href="/empresas">Volver a mis empresas</Link>
    </div>
  );
}
