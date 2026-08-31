use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::OmnathModel;
#[cfg(mobile)]
use mobile::OmnathModel;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the omnath-model APIs.
pub trait OmnathModelExt<R: Runtime> {
    fn omnath_model(&self) -> &OmnathModel<R>;
}

impl<R: Runtime, T: Manager<R>> crate::OmnathModelExt<R> for T {
    fn omnath_model(&self) -> &OmnathModel<R> {
        self.state::<OmnathModel<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("omnath-model")
        .invoke_handler(tauri::generate_handler![
            commands::status,
            commands::load_model,
            commands::generate,
            commands::cancel,
            commands::unload,
            commands::benchmark
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let omnath_model = mobile::init(app, api)?;
            #[cfg(desktop)]
            let omnath_model = desktop::init(app, api)?;
            app.manage(omnath_model);
            Ok(())
        })
        .build()
}
