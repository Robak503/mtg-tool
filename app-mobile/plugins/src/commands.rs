use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::OmnathModelExt;
use crate::Result;

#[command]
pub(crate) async fn status<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.omnath_model().status()
}
#[command]
pub(crate) async fn load_model<R: Runtime>(
    app: AppHandle<R>,
    payload: ModelRequest,
) -> Result<serde_json::Value> {
    app.omnath_model().load_model(payload)
}
#[command]
pub(crate) async fn generate<R: Runtime>(
    app: AppHandle<R>,
    payload: GenerateRequest,
) -> Result<serde_json::Value> {
    app.omnath_model().generate(payload)
}
#[command]
pub(crate) async fn cancel<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.omnath_model().cancel()
}
#[command]
pub(crate) async fn unload<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.omnath_model().unload()
}
#[command]
pub(crate) async fn benchmark<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.omnath_model().benchmark()
}
