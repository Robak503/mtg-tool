use std::net::TcpStream;
use std::sync::{Arc, Mutex};

/// Strip the Windows extended-length `\\?\` prefix from a path string.
///
/// Tauri's resource_dir() returns paths in extended form (e.g.
/// `\\?\C:\Users\...`). Node.js v22+ fails to parse these — it ends up
/// lstat'ing just the drive letter ("C:") and throwing EISDIR. So we
/// hand Node a plain `C:\Users\...` path instead.
#[cfg(not(debug_assertions))]
fn strip_unc(p: &std::path::Path) -> String {
    let s = p.to_string_lossy().into_owned();
    s.strip_prefix(r"\\?\").map(|t| t.to_string()).unwrap_or(s)
}

/// Recursive copy used to seed the user data dir on first launch.
#[cfg(not(debug_assertions))]
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let s = entry.path();
        let d = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&s, &d)?;
        } else {
            std::fs::copy(&s, &d)?;
        }
    }
    Ok(())
}

/// Poll TCP port until it accepts connections or timeout expires.
#[cfg(not(debug_assertions))]
fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Holds the spawned Next.js process in production so we can kill it on exit.
    let server_child: Arc<Mutex<Option<std::process::Child>>> =
        Arc::new(Mutex::new(None));
    let server_child_events = server_child.clone();

    tauri::Builder::default()
        .setup(move |app| {
            // Debug builds: pipe logs to the Tauri log plugin.
            #[cfg(debug_assertions)]
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // Release builds: spawn the bundled Next.js standalone server.
            // The window's devUrl is overridden in dev; in release the window
            // loads http://127.0.0.1:3000 which this server provides.
            #[cfg(not(debug_assertions))]
            {
                use std::io::Write;
                use tauri::Manager;

                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("resource dir not found");

                let data_dir = app
                    .path()
                    .app_data_dir()
                    .expect("app data dir not found");

                // First launch: ensure the writable data directory exists.
                let _ = std::fs::create_dir_all(&data_dir);

                // Launch log lives in %APPDATA%\com.colton.mtg-tool\launch.log
                let log_path = data_dir.join("launch.log");
                let mut log = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .ok();

                macro_rules! logln {
                    ($($arg:tt)*) => {
                        if let Some(ref mut f) = log {
                            let _ = writeln!(f, $($arg)*);
                        }
                    };
                }

                logln!(
                    "--- launch (epoch secs: {}) ---",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                );
                logln!("resource_dir = {}", resource_dir.display());
                logln!("data_dir     = {}", data_dir.display());

                let staged = resource_dir.join("resources");
                let server_js = staged.join("server").join("server.js");
                let mtg_judge_dir = staged.join("mtg-judge");
                let mtg_engine_dir = staged.join("MTG ENGINE");

                logln!("staged       = {} (exists={})", staged.display(), staged.exists());
                logln!("server_js    = {} (exists={})", server_js.display(), server_js.exists());

                let seed_data = staged.join("data");
                if seed_data.exists() {
                    let user_data = data_dir.join("data");
                    if !user_data.exists() {
                        match copy_dir_recursive(&seed_data, &user_data) {
                            Ok(_) => logln!("seeded user data dir at {}", user_data.display()),
                            Err(e) => logln!("seed copy failed: {e}"),
                        }
                    }
                }

                // Redirect server stdout/stderr to log files so we can
                // diagnose crashes after the fact.
                let stdout_log = data_dir.join("server.out.log");
                let stderr_log = data_dir.join("server.err.log");
                let stdout_file = std::fs::File::create(&stdout_log).ok();
                let stderr_file = std::fs::File::create(&stderr_log).ok();

                let server_js_str = strip_unc(&server_js);
                let server_dir_str = strip_unc(server_js.parent().unwrap_or(&staged));
                let mut cmd = std::process::Command::new("node");
                cmd.arg(&server_js_str)
                    .env("PORT", "3000")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("MTG_APP_ROOT", strip_unc(&data_dir))
                    .env("MTG_JUDGE_DIR", strip_unc(&mtg_judge_dir))
                    .env("MTG_ENGINE_DIR", strip_unc(&mtg_engine_dir))
                    .current_dir(&server_dir_str);
                if let Some(f) = stdout_file {
                    cmd.stdout(std::process::Stdio::from(f));
                }
                if let Some(f) = stderr_file {
                    cmd.stderr(std::process::Stdio::from(f));
                }

                match cmd.spawn() {
                    Ok(child) => {
                        logln!("spawned node, pid={}", child.id());
                        let ready = wait_for_port(3000, 30);
                        logln!("port 3000 ready = {ready}");
                        *server_child.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        logln!("Failed to spawn node: {e}");
                        logln!("(is Node.js on PATH? `where node` should resolve.)");
                    }
                }
            }

            Ok(())
        })
        .on_window_event(move |_window, event| {
            // Kill the Node process when the last window closes.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut guard) = server_child_events.lock() {
                    if let Some(ref mut child) = *guard {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
