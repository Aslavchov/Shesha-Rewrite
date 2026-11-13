//! Types that cross the HTTP API, shared by the server and (through the
//! generated TypeScript in `web/src/generated`) the frontend.
//!
//! After changing anything here, regenerate the TypeScript with
//! `cargo run -p contracts --bin generate-types`.

pub mod codegen;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The product name. This is the only place it is written down: the server
/// and the frontend (via the generated `app.ts`) both read it from here.
pub const APP_NAME: &str = "Shesha 2.0";

/// Overall state of the server, as reported by `GET /api/health`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok,
    Error,
}

/// State of the database connection, as reported by `GET /api/health`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum DbStatus {
    Ok,
    Error,
}

/// Body of `GET /api/health`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct HealthResponse {
    pub status: HealthStatus,
    pub version: String,
    pub db: DbStatus,
}

impl HealthResponse {
    /// Builds the response from its parts. `status` is derived, so it can
    /// never say "ok" while a part reports an error.
    pub fn new(version: impl Into<String>, db: DbStatus) -> Self {
        let status = match db {
            DbStatus::Ok => HealthStatus::Ok,
            DbStatus::Error => HealthStatus::Error,
        };
        Self {
            status,
            version: version.into(),
            db,
        }
    }
}

/// Body of `GET /api/info`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    /// Short git SHA of the build, or "dev".
    pub commit: String,
}

/// The standard body of every API error response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ApiError {
    pub error: ApiErrorBody,
}

/// The `error` member of an API error response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ApiErrorBody {
    /// Stable, machine-readable identifier in snake_case.
    pub code: String,
    /// Human-readable explanation.
    pub message: String,
}

impl ApiError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: ApiErrorBody {
                code: code.into(),
                message: message.into(),
            },
        }
    }
}
