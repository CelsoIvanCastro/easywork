// Contrato público de la API v1 (compartido por web y apps). Las entradas se validan en el servidor.
export const API_VERSION = "v1";
export type ApiError = { code: string; message: string; fieldErrors?: Record<string, string> };
export type ApiResult<T> = { data: T } | { error: ApiError };
// Endpoints: POST /api/v1/rpc { op, companyId?, input }  ·  POST /api/v1/upload (multipart)
//            POST /api/v1/auth/{login,2fa,logout,forgot}  ·  GET /api/archivos/:companyId/:versionId[?modo=descargar]
