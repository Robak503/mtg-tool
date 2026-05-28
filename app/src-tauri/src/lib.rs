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

// (No seed_missing helper anymore — bundled reference data is read
// straight from MTG_REFERENCE_DIR via paths.js fallback. See
// app/src/lib/server/paths.js dataPath() for the fallback rule.)

/// Roll the launch log over when it gets larger than ~1MB. We keep the
/// most-recent rolled file as `.1`; older history is dropped. Without
/// this the file would grow unbounded over years of daily launches.
#[cfg(not(debug_assertions))]
fn rotate_log_if_large(path: &std::path::Path, max_bytes: u64) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > max_bytes {
            let rolled = path.with_extension("log.1");
            let _ = std::fs::remove_file(&rolled);
            let _ = std::fs::rename(path, &rolled);
        }
    }
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

                // Launch log lives in %APPDATA%\com.colton.mtg-tool\launch.log.
                // Roll at ~1MB so it never fills the user's disk after years
                // of daily launches.
                let log_path = data_dir.join("launch.log");
                rotate_log_if_large(&log_path, 1_000_000);
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
                let reference_data_dir = staged.join("data");

                logln!("staged       = {} (exists={})", staged.display(), staged.exists());
                logln!("server_js    = {} (exists={})", server_js.display(), server_js.exists());
                logln!("reference    = {} (exists={})", reference_data_dir.display(), reference_data_dir.exists());

                // Always make sure the writable data dir exists so the
                // server can write user files (decks/chats/feedback/etc).
                // We DON'T copy the bundled reference data here anymore —
                // paths.js falls back to MTG_REFERENCE_DIR for any file
                // missing in the writable dir. This saves ~1 GB of disk
                // and turns first launch from 30-60s into instant.
                let _ = std::fs::create_dir_all(data_dir.join("data"));

                // Redirect server stdout/stderr to log files so we can
                // diagnose crashes after the fact.
                let stdout_log = data_dir.join("server.out.log");
                let stderr_log = data_dir.join("server.err.log");
                let stdout_file = std::fs::File::create(&stdout_log).ok();
                let stderr_file = std::fs::File::create(&stderr_log).ok();

                let server_js_str = strip_unc(&server_js);
                let server_dir_str = strip_unc(server_js.parent().unwrap_or(&staged));

                // Prefer the bundled portable node.exe over whatever's
                // on PATH. download-portable-node.cjs places it at
                // <resources>/node/node.exe so the .exe doesn't require
                // a pre-installed Node. If the bundled binary is missing
                // (older build / unbundled debug run) fall back to PATH.
                let bundled_node = staged.join("node").join("node.exe");
                let node_invocation = if bundled_node.exists() {
                    strip_unc(&bundled_node)
                } else {
                    "node".to_string()
                };
                logln!("node binary  = {} (bundled={})", node_invocation, bundled_node.exists());

                let mut cmd = std::process::Command::new(&node_invocation);
                cmd.arg(&server_js_str)
                    .env("PORT", "3000")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("MTG_APP_ROOT", strip_unc(&data_dir))
                    .env("MTG_JUDGE_DIR", strip_unc(&mtg_judge_dir))
                    .env("MTG_ENGINE_DIR", strip_unc(&mtg_engine_dir))
                    .env("MTG_REFERENCE_DIR", strip_unc(&reference_data_dir))
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
