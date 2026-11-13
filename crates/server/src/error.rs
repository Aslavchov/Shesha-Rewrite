//! The one error type of the API. Every API error response is built here, so
//! they all share the standard shape from `contracts::ApiError`.

use axum::Json;
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use contracts::ApiError;

/// The `Display` text is the human-readable `message` sent to the client.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No API endpoint at {path}.")]
    NotFound { path: String },

    #[error("{method} is not supported at {path}.")]
    MethodNotAllowed { method: Method, path: String },

    /// Details belong in the log, not in the response.
    #[error("The server hit an unexpected error.")]
    Internal,
}

impl AppError {
    fn status(&self) -> StatusCode {
        match self {
            Self::NotFound { .. } => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed { .. } => StatusCode::METHOD_NOT_ALLOWED,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::NotFound { .. } => "not_found",
            Self::MethodNotAllowed { .. } => "method_not_allowed",
            Self::Internal => "internal_error",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = ApiError::new(self.code(), self.to_string());
        (self.status(), Json(body)).into_response()
    }
}
