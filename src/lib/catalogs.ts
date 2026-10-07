// Catálogos compartidos entre servidor e interfaz.

export const EMPLOYEE_FIELDS = {
  firstName: "Nombre(s)",
  lastName: "Apellidos",
  birthDate: "Fecha de nacimiento",
  curp: "CURP",
  rfc: "RFC",
  nss: "NSS",
  phone: "Teléfono",
  email: "Correo",
  address: "Domicilio",
  department: "Departamento",
  position: "Puesto",
  bank: "Cuenta bancaria (CLABE)",
} as const;

export const DOC_TYPES = {
  INE_FRONT: "INE (frente)",
  INE_BACK: "INE (reverso)",
  PHOTO: "Fotografía",
  CSF: "Constancia de situación fiscal",
  BIRTH_CERT: "Acta de nacimiento",
  PROOF_ADDRESS: "Comprobante de domicilio",
  CURP_DOC: "CURP",
  LICENSE: "Licencia de conducir",
  NSS_DOC: "Documento de Seguridad Social",
  CONTRACT: "Contrato",
  OFFBOARDING: "Documento de baja",
  OTHER: "Otro",
} as const;

export const DOC_CATEGORIES = ["Contratos", "Manuales", "Reglamentos", "Políticas", "Fiscal / administrativo", "Facturas", "Otros"] as const;

export const EMPLOYEE_STATUS = { ACTIVE: "Activo", SUSPENDED: "Suspendido", OFFBOARDING: "Baja en proceso", FORMER: "Exempleado" } as const;
export const TERMINATION_REASONS = { RESIGNATION: "Renuncia", DISMISSAL: "Despido", CONTRACT_END: "Fin de contrato", OTHER: "Otro" } as const;

export const ASSET_STATUS = { ACTIVE: "Activo", IN_MAINTENANCE: "En mantenimiento", OUT_OF_SERVICE: "Fuera de servicio", SOLD: "Vendido", DISPOSED: "Dado de baja" } as const;
export const PURCHASE_STATUS = { DRAFT: "Borrador", CONFIRMED: "Confirmada", PARTIAL: "Recibida parcialmente", RECEIVED: "Recibida", CANCELLED: "Cancelada" } as const;
export const MAINT_STATUS = { SCHEDULED: "Programado", IN_PROGRESS: "En curso", DONE: "Completado", CANCELLED: "Cancelado" } as const;
export const MOVEMENT_TYPES = { INITIAL: "Saldo inicial", IN: "Entrada", OUT: "Salida", ADJUST: "Ajuste", REVERSAL: "Reversión", RECEIPT: "Recepción de compra", RECEIPT_REVERSAL: "Reversión de recepción" } as const;

// Categorías sugeridas: la empresa elige cuáles activar; ninguna se impone.
export const SUGGESTED_CATEGORIES = [
  { key: "consumibles", name: "Consumibles", tracking: "STOCK" },
  { key: "papeleria", name: "Papelería", tracking: "STOCK" },
  { key: "limpieza", name: "Limpieza", tracking: "STOCK" },
  { key: "herramientas", name: "Herramientas", tracking: "ASSET" },
  { key: "equipo-computo", name: "Equipo de cómputo", tracking: "ASSET" },
  { key: "mobiliario", name: "Mobiliario", tracking: "ASSET" },
  { key: "vehiculos", name: "Vehículos", tracking: "ASSET" },
  { key: "maquinaria", name: "Maquinaria", tracking: "ASSET" },
  { key: "uniformes", name: "Uniformes", tracking: "STOCK" },
  { key: "materiales", name: "Materiales", tracking: "STOCK" },
] as const;

export const UNITS = ["pieza", "caja", "paquete", "litro", "kg", "metro", "rollo", "par", "servicio"] as const;
export const CURRENCIES = ["MXN", "USD", "EUR"] as const;
