//! Types that cross the HTTP API, shared by the server and (through the
//! generated TypeScript in `web/src/generated`) the frontend.
//!
//! After changing anything here, regenerate the TypeScript with
//! `cargo run -p contracts --bin generate-types`.

pub mod codegen;
pub mod forms;

pub use forms::{
    ColorToken, ColorValue, ComponentInstance, CreateFormRequest, FORM_FORMAT_VERSION, FontWeight,
    FormDocument, FormList, FormRecord, FormSummary, Radius, Settings, SlotStyle, Space,
    UpdateFormRequest,
};

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
    /// The individual problems, when there are several with a location.
    /// Left out when there is nothing to list (ADR 0007).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub details: Option<Vec<ErrorDetail>>,
}

/// One located problem inside an API error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ErrorDetail {
    /// Where the problem is, such as `components[1].regions.col2[0].name`.
    pub path: String,
    /// A sentence for a person.
    pub message: String,
}

impl ErrorDetail {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl ApiError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: ApiErrorBody {
                code: code.into(),
                message: message.into(),
                details: None,
            },
        }
    }

    /// Adds located problems. An empty list leaves `details` out.
    pub fn with_details(mut self, details: Vec<ErrorDetail>) -> Self {
        self.error.details = (!details.is_empty()).then_some(details);
        self
    }
}
