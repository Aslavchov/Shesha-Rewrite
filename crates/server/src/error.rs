//! The one error type of the API. Every API error response is built here, so
//! they all share the standard shape from `contracts::ApiError`.

use axum::Json;
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use contracts::{ApiError, ErrorDetail};

/// The `Display` text is the human-readable `message` sent to the client.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No API endpoint at {path}.")]
    NotFound { path: String },

    #[error("{method} is not supported at {path}.")]
    MethodNotAllowed { method: Method, path: String },

    /// The request could not be used at all.
    #[error("{message}")]
    InvalidRequest { message: String },

    #[error("The request body is too large.")]
    PayloadTooLarge,

    #[error("There is no form with the id {id}.")]
    FormNotFound { id: String },

    /// The document was read and is wrong; `details` lists every problem.
    #[error("{}", invalid_form_message(.details.len()))]
    InvalidForm { details: Vec<ErrorDetail> },

    #[error(
        "The form has changed since revision {based_on}: it is now at revision {current}. Load it again and reapply the change."
    )]
    RevisionConflict { based_on: u32, current: u32 },

    /// The theme was read and is wrong; `details` lists every problem.
    #[error("{}", invalid_theme_message(.details.len()))]
    InvalidTheme { details: Vec<ErrorDetail> },

    #[error(
        "The theme draft has changed since revision {based_on}: it is now at revision {current}. Load it again and reapply the change."
    )]
    ThemeRevisionConflict { based_on: u32, current: u32 },

    /// Something the address names does not exist (Phase 5: an entity, a
    /// reference list, a row).
    #[error("{message}")]
    Missing { code: &'static str, message: String },

    /// What was sent was read and is wrong; `details` lists every problem
    /// (Phase 5: a definition, a row, a query).
    #[error("{message}")]
    Invalid {
        code: &'static str,
        message: String,
        details: Vec<ErrorDetail>,
    },

    /// What was asked is well formed, but the data as it is now does not
    /// allow it: a stale revision, a change that would lose values, a delete
    /// of something still in use.
    #[error("{message}")]
    Refused {
        code: &'static str,
        message: String,
        details: Vec<ErrorDetail>,
    },

    /// Details belong in the log, not in the response.
    #[error("The server hit an unexpected error.")]
    Internal,
}

fn invalid_form_message(problems: usize) -> String {
    match problems {
        1 => "The form document has 1 problem.".to_owned(),
        n => format!("The form document has {n} problems."),
    }
}

fn invalid_theme_message(problems: usize) -> String {
    match problems {
        1 => "The theme has 1 problem.".to_owned(),
        n => format!("The theme has {n} problems."),
    }
}

/// "The entity has 1 problem." or "The row has 3 problems."
fn problems_message(what: &str, problems: usize) -> String {
    match problems {
        1 => format!("The {what} has 1 problem."),
        n => format!("The {what} has {n} problems."),
    }
}

impl AppError {
    /// 404 with a code of its own, such as `entity_not_found`.
    pub fn missing(code: &'static str, message: impl Into<String>) -> Self {
        Self::Missing {
            code,
            message: message.into(),
        }
    }

    /// 400 listing every problem of `what`: "The row has 2 problems."
    pub fn invalid(code: &'static str, what: &str, details: Vec<ErrorDetail>) -> Self {
        Self::Invalid {
            code,
            message: problems_message(what, details.len()),
            details,
        }
    }

    /// 409 with a plain reason.
    pub fn refused(code: &'static str, message: impl Into<String>) -> Self {
        Self::Refused {
            code,
            message: message.into(),
            details: Vec::new(),
        }
    }

    /// 409 `revision_conflict` for anything with a revision.
    pub fn stale(what: &str, based_on: u32, current: u32) -> Self {
        Self::refused(
            "revision_conflict",
            format!(
                "The {what} has changed since revision {based_on}: it is now at revision {current}. Load it again and reapply the change."
            ),
        )
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: message.into(),
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Self::NotFound { .. } | Self::FormNotFound { .. } | Self::Missing { .. } => {
                StatusCode::NOT_FOUND
            }
            Self::MethodNotAllowed { .. } => StatusCode::METHOD_NOT_ALLOWED,
            Self::InvalidRequest { .. }
            | Self::InvalidForm { .. }
            | Self::InvalidTheme { .. }
            | Self::Invalid { .. } => StatusCode::BAD_REQUEST,
            Self::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::RevisionConflict { .. }
            | Self::ThemeRevisionConflict { .. }
            | Self::Refused { .. } => StatusCode::CONFLICT,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::NotFound { .. } => "not_found",
            Self::MethodNotAllowed { .. } => "method_not_allowed",
            Self::InvalidRequest { .. } => "invalid_request",
            Self::PayloadTooLarge => "payload_too_large",
            Self::FormNotFound { .. } => "form_not_found",
            Self::InvalidForm { .. } => "invalid_form",
            Self::InvalidTheme { .. } => "invalid_theme",
            Self::RevisionConflict { .. } | Self::ThemeRevisionConflict { .. } => {
                "revision_conflict"
            }
            Self::Missing { code, .. }
            | Self::Invalid { code, .. }
            | Self::Refused { code, .. } => code,
            Self::Internal => "internal_error",
        }
    }
}

/// A database failure is never the caller's doing: log it, answer 500.
impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!("database error: {error}");
        Self::Internal
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        let body = ApiError::new(self.code(), self.to_string());
        let body = match self {
            Self::InvalidForm { details }
            | Self::InvalidTheme { details }
            | Self::Invalid { details, .. }
            | Self::Refused { details, .. } => body.with_details(details),
            _ => body,
        };
        (status, Json(body)).into_response()
    }
}
