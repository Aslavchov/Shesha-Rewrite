//! The JSON API. Mounted at `/api` by `router.rs`.

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, OriginalUri, State};
use axum::http::{Method, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use contracts::{APP_NAME, AppInfo, DbStatus, ErrorDetail, HealthResponse, MAX_REQUEST_BYTES};
use serde_json::{Map, Value};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::error::AppError;
use crate::router::AppState;
use crate::{build_info, data, db, entities, forms, themes};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/info", get(info))
        .merge(forms::router())
        .merge(themes::router())
        .merge(entities::router())
        .merge(data::router())
        .fallback(not_found)
        .method_not_allowed_fallback(method_not_allowed)
        // The limit is a shared constant, so the designer knows it too.
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BYTES as usize))
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<HealthResponse>) {
    let (status, db) = if db::is_reachable(&state.pool).await {
        (StatusCode::OK, DbStatus::Ok)
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, DbStatus::Error)
    };
    (status, Json(HealthResponse::new(build_info::VERSION, db)))
}

async fn info() -> Json<AppInfo> {
    Json(AppInfo {
        name: APP_NAME.to_owned(),
        version: build_info::VERSION.to_owned(),
        commit: build_info::COMMIT.to_owned(),
    })
}

// `OriginalUri` rather than `Uri`: inside the nested router the latter has
// the `/api` prefix stripped.
async fn not_found(OriginalUri(uri): OriginalUri) -> AppError {
    AppError::NotFound {
        path: uri.path().to_owned(),
    }
}

async fn method_not_allowed(method: Method, OriginalUri(uri): OriginalUri) -> AppError {
    AppError::MethodNotAllowed {
        method,
        path: uri.path().to_owned(),
    }
}

/// The request body as a JSON object. The body is read by hand, rather than
/// with axum's `Json` extractor, so that every failure uses the standard
/// error shape and a wrong `Content-Type` is not held against the caller.
pub(crate) fn request_object(
    body: Result<Bytes, BytesRejection>,
) -> Result<Map<String, Value>, AppError> {
    let body = body.map_err(|_| AppError::PayloadTooLarge)?;
    match serde_json::from_slice(&body) {
        Ok(Value::Object(object)) => Ok(object),
        Ok(_) => Err(AppError::invalid_request(
            "The request body must be a JSON object.",
        )),
        Err(error) => Err(AppError::invalid_request(format!(
            "The request body is not valid JSON: {error}."
        ))),
    }
}

/// The `revision` a write says it was based on.
pub(crate) fn based_on_revision(body: &Map<String, Value>) -> Result<u32, AppError> {
    body.get("revision")
        .and_then(Value::as_u64)
        .and_then(|revision| u32::try_from(revision).ok())
        .ok_or_else(|| {
            AppError::invalid_request(
                "The request needs \"revision\": the revision number this change was based on.",
            )
        })
}

/// Where and why typed deserialisation of a request failed, as a located
/// problem. serde's messages start in lower case and have no full stop.
pub(crate) fn parse_problem(error: &serde_path_to_error::Error<serde_json::Error>) -> ErrorDetail {
    let path = error.path().to_string();
    let path = if path == "." { String::new() } else { path };
    let message = error.inner().to_string();
    let mut chars = message.chars();
    let mut sentence: String = match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    };
    if !sentence.ends_with('.') {
        sentence.push('.');
    }
    ErrorDetail::new(path, sentence)
}

/// A transaction for reading: every statement in it sees the database as it
/// was when the first one ran, so a definition and the rows read with it
/// always belong together.
pub(crate) async fn reading(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, AppError> {
    Ok(pool.begin().await?)
}

/// A transaction for writing. It takes the write lock at once, so what it
/// checks (a revision, that a referenced row exists, that no row would lose a
/// value) still holds when it writes.
pub(crate) async fn writing(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, AppError> {
    Ok(pool.begin_with("BEGIN IMMEDIATE").await?)
}
