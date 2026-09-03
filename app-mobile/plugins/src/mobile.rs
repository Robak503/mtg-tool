use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_omnath_model);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<OmnathModel<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.colton.omnathmodel", "OmnathModelPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_omnath_model)?;
    Ok(OmnathModel(handle))
}

/// Access to the omnath-model APIs.
pub struct OmnathModel<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> OmnathModel<R> {
    pub fn status(&self) -> crate::Result<serde_json::Value> {
        self.0.run_mobile_plugin("status", ()).map_err(Into::into)
    }
    pub fn load_model(&self, payload: ModelRequest) -> crate::Result<serde_json::Value> {
        self.0
            .run_mobile_plugin("loadModel", payload)
            .map_err(Into::into)
    }
    pub fn generate(&self, payload: GenerateRequest) -> crate::Result<serde_json::Value> {
        self.0
            .run_mobile_plugin("generate", payload)
            .map_err(Into::into)
    }
    pub fn cancel(&self) -> crate::Result<serde_json::Value> {
        self.0.run_mobile_plugin("cancel", ()).map_err(Into::into)
    }
    pub fn unload(&self) -> crate::Result<serde_json::Value> {
        self.0.run_mobile_plugin("unload", ()).map_err(Into::into)
    }
    pub fn benchmark(&self) -> crate::Result<serde_json::Value> {
        self.0
            .run_mobile_plugin("benchmark", ())
            .map_err(Into::into)
    }
    pub fn copy_bundled_asset(
        &self,
        payload: AssetCopyRequest,
    ) -> crate::Result<serde_json::Value> {
        self.0
            .run_mobile_plugin("copyBundledAsset", payload)
            .map_err(Into::into)
    }
}
