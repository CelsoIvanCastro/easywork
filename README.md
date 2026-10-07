# EasyWork

Plataforma web multiempresa de administración: personas, estructura, expedientes, documentos privados con versiones,
inventario y activos, proveedores y compras, mantenimiento, alertas, avisos, búsqueda, auditoría e IA de consulta.
Interfaz funcional en español, adaptable a teléfono (diseño visual definitivo pendiente por decisión del producto).

- Puesta en marcha, pruebas, copias, producción e IA: [docs/OPERACION.md](docs/OPERACION.md)
- Arquitectura y modelo: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) · Permisos: [docs/PERMISOS.md](docs/PERMISOS.md)
- Estado, evidencias y pendientes: [docs/ESTADO.md](docs/ESTADO.md)

Inicio rápido: `npm install && npm run setup && npm run db` (otra terminal) `npm run db:migrate && npm run generate && npm run seed && npm run dev`
y en otra terminal `npm run worker`. Entra con las cuentas de `.local/demo-credenciales.txt`.
