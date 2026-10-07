//! Puente nativo mínimo de EasyWork para escritorio.
//! Solo expone: guardar/leer/borrar el token de sesión en el almacén de credenciales del sistema
//! (Llavero de macOS, Administrador de credenciales de Windows) y abrir enlaces https en el navegador.
//! Sin acceso a archivos ni a la línea de comandos para el contenido web.

const SERVICE: &str = "EasyWork";
const ACCOUNT: &str = "session";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn token_set(token: String) -> Result<(), String> {
    if token.len() > 512 {
        return Err("token inválido".into());
    }
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Valida que el enlace sea https (o el servidor local en compilaciones de desarrollo).
fn allowed_external(url: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(url).map_err(|_| "URL inválida".to_string())?;
    // http solo hacia el propio equipo (servidor local de pruebas); nunca hacia otros hosts.
    let local_dev = u.scheme() == "http" && matches!(u.host_str(), Some("localhost") | Some("127.0.0.1"));
    if u.scheme() != "https" && !local_dev {
        return Err("Solo se permiten enlaces https".into());
    }
    Ok(u)
}

/// Abre solo URLs permitidas en el navegador del sistema.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let u = allowed_external(&url)?;
    open::that(u.as_str()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::allowed_external;
    #[test]
    fn solo_https() {
        assert!(allowed_external("https://ejemplo.mx/privacidad").is_ok());
        assert!(allowed_external("file:///etc/passwd").is_err());
        assert!(allowed_external("javascript:alert(1)").is_err());
        assert!(allowed_external("smb://servidor/recurso").is_err());
        assert!(allowed_external("no es url").is_err());
        assert!(allowed_external("http://localhost:3000/registro").is_ok());
        assert!(allowed_external("http://ejemplo.mx").is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![token_get, token_set, token_clear, open_external])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar EasyWork");
}
