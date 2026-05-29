// Only used by wait_for_port, which is release-only (debug builds connect to
// the Next dev server instead of spawning the bundled one), so gate the import
// to match — otherwise debug/clippy builds flag it as unused.
#[cfg(not(debug_assertions))]
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
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    false
}

/// Pin the spawned Node server to a Windows Job Object configured to kill
/// every member process when the job's last handle closes.
///
/// The only handle is owned by *this* process, so the OS tears Node down
/// the instant mtg-tool.exe dies — including a force-kill by the NSIS
/// auto-updater (which replaces the .exe out from under us and never lets
/// our CloseRequested/Destroyed handlers run), a crash, or Task Manager.
/// This is what guarantees next-server can never outlive the shell.
///
/// The job handle is intentionally leaked on success: it must stay open
/// for the whole process lifetime, since closing it early is precisely
/// what would trigger KILL_ON_JOB_CLOSE and take Node down prematurely.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn pin_child_to_job(child: &std::process::Child) -> bool {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return false;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let set_ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if set_ok == 0 {
            CloseHandle(job);
            return false;
        }
        let assigned = AssignProcessToJobObject(job, child.as_raw_handle());
        if assigned == 0 {
            CloseHandle(job);
            return false;
        }
        // Success: deliberately do NOT close `job`. Keeping the handle open
        // for the life of the process is what arms KILL_ON_JOB_CLOSE on exit.
        true
    }
}

/// Reap any orphaned bundled-Node server left behind by a previous version.
///
/// When the auto-updater force-replaces mtg-tool.exe, a node.exe spawned by
/// the *previous* (pre-Job-Object) build can survive and keep listening on
/// port 3000, shadowing the fresh server we're about to start. We sweep it
/// here, BEFORE spawning, so the new server can bind the port cleanly. Once
/// users are on a build that pins Node to a job this is moot, but it makes
/// the one-time upgrade to the fixed build seamless instead of needing a
/// reboot.
///
/// SAFETY: we only ever terminate a process named node.exe whose full image
/// path is byte-for-byte our bundled node.exe. No other application runs
/// that specific binary, so this can never kill an unrelated user process.
/// Any uncertainty (can't open the process, path mismatch) means we skip it.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn reap_orphan_servers(bundled_node: &std::path::Path) -> usize {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    };

    let target = strip_unc(bundled_node).to_lowercase();
    let mut killed = 0usize;

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return 0;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let name_len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);

                if name.eq_ignore_ascii_case("node.exe") {
                    let handle = OpenProcess(
                        PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
                        0,
                        entry.th32ProcessID,
                    );
                    if !handle.is_null() {
                        let mut buf = [0u16; 512];
                        let mut size = buf.len() as u32;
                        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
                        if ok != 0 {
                            let full =
                                String::from_utf16_lossy(&buf[..size as usize]).to_lowercase();
                            if full == target && TerminateProcess(handle, 1) != 0 {
                                killed += 1;
                            }
                        }
                        CloseHandle(handle);
                    }
                }

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
    }

    killed
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Holds the spawned Next.js process in production so we can kill it on exit.
    let server_child: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    let server_child_events = server_child.clone();
    let server_child_tray = server_child.clone();

    tauri::Builder::default()
        // Single-instance: launching mtg-tool.exe while it's already
        // running focuses the existing window instead of spawning a
        // second process (which would collide on port 3000 anyway).
        // The callback receives the second instance's argv — useful
        // later for "open .dec with MTG Tool" file-association deep links.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Autostart with Windows is opt-in via the UI — registered here
        // so the JS plugin can enable/disable it without privilege.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(move |app| {
            // When launched at Windows startup the autostart plugin
            // injects --autostart; start hidden in tray so we don't
            // pop a window in the user's face. Normal double-click
            // launches don't have this flag and behave as before.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                let launched_at_startup = std::env::args().any(|a| a == "--autostart");
                if launched_at_startup {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }

            // System tray: lets the user minimize to tray instead of
            // exiting (Next.js + Ollama warm-up costs are noticeable, so
            // an instant "show window" is worth keeping the server hot).
            // Right-click menu has Show / Hide / Quit.
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Manager;

                let show =
                    MenuItem::with_id(app, "tray-show", "Show MTG Tool", true, None::<&str>)?;
                let hide = MenuItem::with_id(app, "tray-hide", "Hide window", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

                let server_child_for_quit = server_child_tray.clone();
                let _tray = TrayIconBuilder::with_id("mtg-tool-tray")
                    .tooltip("MTG Tool")
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| {
                        match event.id.as_ref() {
                            "tray-show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "tray-hide" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.hide();
                                }
                            }
                            "tray-quit" => {
                                // Kill the Node child before app exits so we
                                // don't leave an orphan server on port 3000.
                                if let Ok(mut guard) = server_child_for_quit.lock() {
                                    if let Some(ref mut child) = *guard {
                                        let _ = child.kill();
                                    }
                                }
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        // Left-click the tray icon to toggle window visibility.
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let visible = w.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }
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

                let resource_dir = app.path().resource_dir().expect("resource dir not found");

                let data_dir = app.path().app_data_dir().expect("app data dir not found");

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

                logln!(
                    "staged       = {} (exists={})",
                    staged.display(),
                    staged.exists()
                );
                logln!(
                    "server_js    = {} (exists={})",
                    server_js.display(),
                    server_js.exists()
                );
                logln!(
                    "reference    = {} (exists={})",
                    reference_data_dir.display(),
                    reference_data_dir.exists()
                );

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
                logln!(
                    "node binary  = {} (bundled={})",
                    node_invocation,
                    bundled_node.exists()
                );

                // Reap any orphaned bundled-Node server left running by a
                // previous version (e.g. one that survived an auto-update
                // force-replace) so it can't keep port 3000 and shadow the
                // server we're about to start. Single-instance guarantees
                // we're the only mtg-tool.exe, so any node.exe running our
                // bundled binary is by definition a stale orphan.
                #[cfg(target_os = "windows")]
                if bundled_node.exists() {
                    let reaped = reap_orphan_servers(&bundled_node);
                    if reaped > 0 {
                        logln!("reaped {reaped} orphaned node server(s) before spawn");
                    }
                }

                let mut cmd = std::process::Command::new(&node_invocation);

                // Hide the child Node's console window on Windows.
                // Without CREATE_NO_WINDOW, Windows attaches a fresh
                // cmd.exe to the child and flashes it at the user every
                // launch — they see a "next-server v15.x.x" banner pop
                // up briefly. CREATE_NO_WINDOW = 0x08000000 detaches
                // the child from any console entirely.
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000);
                }
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
                        // Pin Node to a kill-on-close Job Object so it can
                        // never outlive this shell — even if the auto-updater
                        // force-kills us without firing our window handlers.
                        #[cfg(target_os = "windows")]
                        {
                            let pinned = pin_child_to_job(&child);
                            logln!("pinned node to kill-on-close job = {pinned}");
                        }
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
        .on_window_event(move |window, event| {
            // Minimize-to-tray instead of exit. Tray "Quit" is the
            // explicit exit path. This keeps the Next.js server warm
            // so reopening the window is instant instead of a 5-30s
            // cold start.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
                return;
            }
            // Genuine destroy (e.g. tray-quit called app.exit which
            // tears down windows) → kill the child server.
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
