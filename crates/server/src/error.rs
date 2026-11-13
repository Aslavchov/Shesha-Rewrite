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

impl AppError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: message.into(),
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Self::NotFound { .. } | Self::FormNotFound { .. } => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed { .. } => StatusCode::METHOD_NOT_ALLOWED,
            Self::InvalidRequest { .. } | Self::InvalidForm { .. } => StatusCode::BAD_REQUEST,
            Self::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::RevisionConflict { .. } => StatusCode::CONFLICT,
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
            Self::RevisionConflict { .. } => "revision_conflict",
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
            Self::InvalidForm { details } => body.with_details(details),
            _ => body,
        };
        (status, Json(body)).into_response()
    }
}
