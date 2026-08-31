use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<OmnathModel<R>> {
    Ok(OmnathModel(app.clone()))
}

/// Access to the omnath-model APIs.
pub struct OmnathModel<R: Runtime>(AppHandle<R>);

impl<R: Runtime> OmnathModel<R> {
    pub fn status(&self) -> crate::Result<serde_json::Value> {
        Ok(serde_json::json!({"state":"unavailable"}))
    }
    pub fn load_model(&self, _payload: ModelRequest) -> crate::Result<serde_json::Value> {
        self.status()
    }
    pub fn generate(&self, _payload: GenerateRequest) -> crate::Result<serde_json::Value> {
        self.status()
    }
    pub fn cancel(&self) -> crate::Result<serde_json::Value> {
        self.status()
    }
    pub fn unload(&self) -> crate::Result<serde_json::Value> {
        self.status()
    }
    pub fn benchmark(&self) -> crate::Result<serde_json::Value> {
        self.status()
    }
}
