const COMMANDS: &[&str] = &[
    "status",
    "load_model",
    "generate",
    "cancel",
    "unload",
    "benchmark",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
