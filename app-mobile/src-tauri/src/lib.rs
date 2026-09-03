use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::{FsExt, OpenOptions};
#[cfg(target_os = "android")]
use tauri_plugin_omnath_model::{AssetCopyRequest, OmnathModelExt};

const DATABASE_FILE: &str = "omnath-knowledge.sqlite";
const MANIFEST_FILE: &str = "omnath-knowledge.manifest.json";
const DATABASE_URL: &str = "sqlite:omnath-knowledge.sqlite";
const ART_DATABASE_FILE: &str = "omnath-art.sqlite";
const ART_MANIFEST_FILE: &str = "omnath-art.manifest.json";
const ART_DATABASE_URL: &str = "sqlite:omnath-art.sqlite";

type BoxError = Box<dyn std::error::Error>;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseReceipt {
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackManifest {
    schema_version: u32,
    pack_id: String,
    database: DatabaseReceipt,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeStatus {
    ready: bool,
    copied: bool,
    schema_version: u32,
    pack_id: String,
    database_url: String,
    database_bytes: u64,
    database_sha256: String,
    art_ready: bool,
    art_copied: bool,
    art_pack_id: Option<String>,
    art_database_url: Option<String>,
    art_database_bytes: u64,
    art_database_sha256: Option<String>,
    art_error: Option<String>,
    error: Option<String>,
}

impl KnowledgeStatus {
    fn pending() -> Self {
        Self {
            ready: false,
            copied: false,
            schema_version: 0,
            pack_id: String::new(),
            database_url: DATABASE_URL.to_string(),
            database_bytes: 0,
            database_sha256: String::new(),
            art_ready: false,
            art_copied: false,
            art_pack_id: None,
            art_database_url: None,
            art_database_bytes: 0,
            art_database_sha256: None,
            art_error: None,
            error: None,
        }
    }

    fn failed(error: impl Into<String>) -> Self {
        Self {
            ready: false,
            copied: false,
            schema_version: 0,
            pack_id: String::new(),
            database_url: DATABASE_URL.to_string(),
            database_bytes: 0,
            database_sha256: String::new(),
            art_ready: false,
            art_copied: false,
            art_pack_id: None,
            art_database_url: None,
            art_database_bytes: 0,
            art_database_sha256: None,
            art_error: None,
            error: Some(error.into()),
        }
    }
}

struct KnowledgeState {
    status: Mutex<KnowledgeStatus>,
    preparing: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeProgress {
    phase: &'static str,
    copied_bytes: u64,
    total_bytes: u64,
}

fn sha256_path(path: &Path) -> Result<String, BoxError> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn existing_pack_matches(
    database_path: &Path,
    manifest_path: &Path,
    bundled: &PackManifest,
) -> bool {
    let Ok(metadata) = fs::metadata(database_path) else {
        return false;
    };
    if metadata.len() != bundled.database.bytes {
        return false;
    }
    let Ok(text) = fs::read_to_string(manifest_path) else {
        return false;
    };
    let Ok(existing) = serde_json::from_str::<PackManifest>(&text) else {
        return false;
    };
    existing.schema_version == bundled.schema_version
        && existing.pack_id == bundled.pack_id
        && existing.database.bytes == bundled.database.bytes
        && existing.database.sha256 == bundled.database.sha256
        && sha256_path(database_path).is_ok_and(|hash| hash == bundled.database.sha256)
}

fn stream_copy_verified<R: Read>(
    mut source: R,
    destination: &Path,
    expected: &DatabaseReceipt,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), BoxError> {
    let mut output = fs::File::create(destination)?;
    let mut hash = Sha256::new();
    let mut bytes = 0_u64;
    let mut buffer = vec![0_u8; 1024 * 1024];

    loop {
        let read = source.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        output.write_all(&buffer[..read])?;
        hash.update(&buffer[..read]);
        bytes += read as u64;
        progress(bytes, expected.bytes);
    }
    output.flush()?;
    output.sync_all()?;

    if bytes != expected.bytes {
        return Err(format!(
            "knowledge database size mismatch: expected {}, copied {bytes}",
            expected.bytes
        )
        .into());
    }
    let actual_hash = format!("{:x}", hash.finalize());
    if actual_hash != expected.sha256 {
        return Err(format!(
            "knowledge database hash mismatch: expected {}, copied {actual_hash}",
            expected.sha256
        )
        .into());
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn copy_resource_verified(
    app: &AppHandle,
    _source_path: &Path,
    destination: &Path,
    expected: &DatabaseReceipt,
    _phase: &'static str,
    asset_kind: &'static str,
) -> Result<(), BoxError> {
    let destination_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid temporary database filename")?;
    app.omnath_model().copy_bundled_asset(AssetCopyRequest {
        asset_kind: asset_kind.to_string(),
        destination_name: destination_name.to_string(),
        expected_bytes: expected.bytes,
        expected_sha256: expected.sha256.clone(),
    })?;
    if fs::metadata(destination)?.len() != expected.bytes
        || sha256_path(destination)? != expected.sha256
    {
        return Err("Native bundled asset receipt mismatch".into());
    }
    Ok(())
}

#[cfg(not(target_os = "android"))]
fn copy_resource_verified(
    app: &AppHandle,
    source_path: &Path,
    destination: &Path,
    expected: &DatabaseReceipt,
    phase: &'static str,
    _asset_kind: &'static str,
) -> Result<(), BoxError> {
    let mut options = OpenOptions::new();
    options.read(true);
    let source = app.fs().open(source_path, options)?;
    stream_copy_verified(
        source,
        destination,
        expected,
        |copied_bytes, total_bytes| {
            let _ = app.emit(
                "knowledge-progress",
                KnowledgeProgress {
                    phase,
                    copied_bytes,
                    total_bytes,
                },
            );
        },
    )
}

fn replace_file(temp_path: &Path, final_path: &Path) -> Result<(), BoxError> {
    if final_path.exists() {
        fs::remove_file(final_path)?;
    }
    fs::rename(temp_path, final_path)?;
    Ok(())
}

fn provision_knowledge(app: &AppHandle) -> Result<KnowledgeStatus, BoxError> {
    let bundled_manifest_path = app.path().resolve(
        format!("knowledge/{MANIFEST_FILE}"),
        BaseDirectory::Resource,
    )?;
    let bundled_database_path = app.path().resolve(
        format!("knowledge/{DATABASE_FILE}"),
        BaseDirectory::Resource,
    )?;
    let manifest_text = app.fs().read_to_string(&bundled_manifest_path)?;
    let manifest: PackManifest = serde_json::from_str(&manifest_text)?;

    let config_dir = app.path().app_config_dir()?;
    fs::create_dir_all(&config_dir)?;
    let database_path = config_dir.join(DATABASE_FILE);
    let manifest_path = config_dir.join(MANIFEST_FILE);
    let copied = !existing_pack_matches(&database_path, &manifest_path, &manifest);

    if copied {
        let temp_database = temporary_path(&database_path);
        let temp_manifest = temporary_path(&manifest_path);
        for temp in [&temp_database, &temp_manifest] {
            if temp.exists() {
                fs::remove_file(temp)?;
            }
        }

        if let Err(error) = copy_resource_verified(
            app,
            &bundled_database_path,
            &temp_database,
            &manifest.database,
            "copying",
            "knowledge",
        ) {
            let _ = fs::remove_file(&temp_database);
            return Err(error);
        }
        fs::write(&temp_manifest, manifest_text.as_bytes())?;
        replace_file(&temp_database, &database_path)?;
        replace_file(&temp_manifest, &manifest_path)?;
    }

    let mut status = KnowledgeStatus {
        ready: true,
        copied,
        schema_version: manifest.schema_version,
        pack_id: manifest.pack_id,
        database_url: DATABASE_URL.to_string(),
        database_bytes: manifest.database.bytes,
        database_sha256: manifest.database.sha256,
        art_ready: false,
        art_copied: false,
        art_pack_id: None,
        art_database_url: None,
        art_database_bytes: 0,
        art_database_sha256: None,
        art_error: None,
        error: None,
    };
    match provision_art(app, &config_dir) {
        Ok(Some(art)) => {
            status.art_ready = true;
            status.art_copied = art.copied;
            status.art_pack_id = Some(art.manifest.pack_id);
            status.art_database_url = Some(ART_DATABASE_URL.to_string());
            status.art_database_bytes = art.manifest.database.bytes;
            status.art_database_sha256 = Some(art.manifest.database.sha256);
        }
        Ok(None) => {}
        Err(error) => status.art_error = Some(error.to_string()),
    }
    Ok(status)
}

struct ProvisionedArt {
    copied: bool,
    manifest: PackManifest,
}

fn provision_art(app: &AppHandle, config_dir: &Path) -> Result<Option<ProvisionedArt>, BoxError> {
    let bundled_manifest_path = app
        .path()
        .resolve(format!("art/{ART_MANIFEST_FILE}"), BaseDirectory::Resource)?;
    let bundled_database_path = app
        .path()
        .resolve(format!("art/{ART_DATABASE_FILE}"), BaseDirectory::Resource)?;
    let Ok(manifest_text) = app.fs().read_to_string(&bundled_manifest_path) else {
        return Ok(None);
    };
    let manifest: PackManifest = serde_json::from_str(&manifest_text)?;
    let database_path = config_dir.join(ART_DATABASE_FILE);
    let manifest_path = config_dir.join(ART_MANIFEST_FILE);
    let copied = !existing_pack_matches(&database_path, &manifest_path, &manifest);

    if copied {
        let temp_database = temporary_path(&database_path);
        let temp_manifest = temporary_path(&manifest_path);
        for temp in [&temp_database, &temp_manifest] {
            if temp.exists() {
                fs::remove_file(temp)?;
            }
        }

        if let Err(error) = copy_resource_verified(
            app,
            &bundled_database_path,
            &temp_database,
            &manifest.database,
            "copying-art",
            "art",
        ) {
            let _ = fs::remove_file(&temp_database);
            return Err(error);
        }
        fs::write(&temp_manifest, manifest_text.as_bytes())?;
        replace_file(&temp_database, &database_path)?;
        replace_file(&temp_manifest, &manifest_path)?;
    }

    Ok(Some(ProvisionedArt { copied, manifest }))
}

fn temporary_path(final_path: &Path) -> PathBuf {
    let mut name = final_path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".tmp-{}", std::process::id()));
    final_path.with_file_name(name)
}

#[tauri::command]
fn knowledge_status(state: State<'_, Arc<KnowledgeState>>) -> KnowledgeStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
async fn prepare_knowledge(
    app: AppHandle,
    state: State<'_, Arc<KnowledgeState>>,
) -> Result<KnowledgeStatus, String> {
    let shared = Arc::clone(state.inner());
    let current = shared.status.lock().unwrap().clone();
    if current.ready {
        return Ok(current);
    }
    if shared.preparing.swap(true, Ordering::AcqRel) {
        let waiting = Arc::clone(&shared);
        return tauri::async_runtime::spawn_blocking(move || {
            while waiting.preparing.load(Ordering::Acquire) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            waiting.status.lock().unwrap().clone()
        })
        .await
        .map_err(|error| error.to_string());
    }
    let _ = app.emit(
        "knowledge-progress",
        KnowledgeProgress {
            phase: "verifying",
            copied_bytes: 0,
            total_bytes: 0,
        },
    );
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        provision_knowledge(&worker_app).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())
    .and_then(|result| result);
    let status = match result {
        Ok(status) => status,
        Err(error) => KnowledgeStatus::failed(error),
    };
    *shared.status.lock().unwrap() = status.clone();
    shared.preparing.store(false, Ordering::Release);
    let _ = app.emit(
        "knowledge-progress",
        KnowledgeProgress {
            phase: if status.ready { "ready" } else { "error" },
            copied_bytes: status.database_bytes,
            total_bytes: status.database_bytes,
        },
    );
    Ok(status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_omnath_model::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.manage(Arc::new(KnowledgeState {
                status: Mutex::new(KnowledgeStatus::pending()),
                preparing: AtomicBool::new(false),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            knowledge_status,
            prepare_knowledge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{label}-{}-{nonce}", std::process::id()))
    }

    fn receipt(bytes: &[u8]) -> DatabaseReceipt {
        DatabaseReceipt {
            bytes: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(bytes)),
        }
    }

    #[test]
    fn copy_verifies_size_and_hash() {
        let root = temp_test_dir("omnath-copy-test");
        fs::create_dir_all(&root).unwrap();
        let destination = root.join("pack.sqlite");
        let bytes = b"sqlite fixture";

        stream_copy_verified(Cursor::new(bytes), &destination, &receipt(bytes), |_, _| {}).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), bytes);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn copy_rejects_a_hash_mismatch() {
        let root = temp_test_dir("omnath-copy-bad-test");
        fs::create_dir_all(&root).unwrap();
        let destination = root.join("pack.sqlite");
        let mut wrong = receipt(b"different");
        wrong.bytes = b"sqlite fixture".len() as u64;

        let error = stream_copy_verified(
            Cursor::new(b"sqlite fixture"),
            &destination,
            &wrong,
            |_, _| {},
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("hash mismatch"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_pack_rejects_same_size_corruption() {
        let root = temp_test_dir("omnath-existing-pack-test");
        fs::create_dir_all(&root).unwrap();
        let database_path = root.join(DATABASE_FILE);
        let manifest_path = root.join(MANIFEST_FILE);
        let expected_bytes = b"known database";
        let manifest = PackManifest {
            schema_version: 1,
            pack_id: "fixture-pack".to_string(),
            database: receipt(expected_bytes),
        };
        fs::write(&database_path, b"badly database").unwrap();
        fs::write(&manifest_path, serde_json::to_string(&manifest).unwrap()).unwrap();

        assert!(!existing_pack_matches(
            &database_path,
            &manifest_path,
            &manifest,
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
