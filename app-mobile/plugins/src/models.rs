use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRequest {
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub request_id: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCopyRequest {
    pub asset_kind: String,
    pub destination_name: String,
    pub expected_bytes: u64,
    pub expected_sha256: String,
}
