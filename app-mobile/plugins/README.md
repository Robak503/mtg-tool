# Omnath local-model Tauri plugin

Phone-owned Android bridge for LiteRT-LM 0.16.1. It exposes a catalog-restricted,
single-engine lifecycle (`status`, `load_model`, `generate`, `cancel`, `unload`,
and `benchmark`) to the Omnath WebView. Model files are side-loaded into the
app's external-files `models` directory and verified by byte count and SHA-256;
they are never bundled into the APK or downloaded by the app.
