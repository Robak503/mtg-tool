use std::net::TcpStream;
use std::sync::{Arc, Mutex};

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

                // Tauri places `resources/` from tauri.conf.json under
                // <resource_dir>/resources/ — see prepare-tauri-resources.cjs
                // for the staging layout.
                let staged = resource_dir.join("resources");
                let server_js = staged.join("server").join("server.js");
                let mtg_judge_dir = staged.join("mtg-judge");
                let mtg_engine_dir = staged.join("MTG ENGINE");

                // Seed data files (slim oracle index) live alongside server
                // code at runtime — copy them into the user data dir on
                // first launch so paths.js's dataPath() resolution works.
                let seed_data = staged.join("data");
                if seed_data.exists() {
                    let user_data = data_dir.join("data");
                    if !user_data.exists() {
                        let _ = copy_dir_recursive(&seed_data, &user_data);
                    }
                }

                match std::process::Command::new("node")
                    .arg(&server_js)
                    .env("PORT", "3000")
                    .env("HOSTNAME", "127.0.0.1")
                    // paths.js reads these; see app/src/lib/server/paths.js
                    .env("MTG_APP_ROOT", data_dir.to_str().unwrap_or(""))
                    .env("MTG_JUDGE_DIR", mtg_judge_dir.to_str().unwrap_or(""))
                    .env("MTG_ENGINE_DIR", mtg_engine_dir.to_str().unwrap_or(""))
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        wait_for_port(3000, 30);
                        *server_child.lock().unwrap() = Some(child);
                    }
                    Err(e) => eprintln!("Failed to start Next.js server: {e}"),
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
