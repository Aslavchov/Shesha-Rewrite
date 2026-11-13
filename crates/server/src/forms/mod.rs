//! `/api/forms`: storing and reading form documents (ADR 0007).

pub mod seed;
pub mod store;
pub mod validate;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use contracts::{FormDocument, FormList};
use serde_json::{Map, Value, json};

use crate::error::AppError;
use crate::router::AppState;
use store::{StoredForm, UpdateOutcome};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/forms", get(list).post(create))
        .route("/forms/{id}", get(read).put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> Result<Json<FormList>, AppError> {
    let forms = store::list(&state.pool).await?;
    Ok(Json(FormList { forms }))
}

async fn create(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut body = request_object(body)?;
    let (form, document) = document_of(&mut body)?;

    let stored = store::create(&state.pool, None, &form, &document).await?;
    Ok((StatusCode::CREATED, Json(record(stored)?)))
}

async fn read(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    match store::get(&state.pool, &id).await? {
        Some(stored) => Ok(Json(record(stored)?)),
        None => Err(AppError::FormNotFound { id }),
    }
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, AppError> {
    let mut body = request_object(body)?;
    let based_on = body
        .get("revision")
        .and_then(Value::as_u64)
        .and_then(|revision| u32::try_from(revision).ok())
        .ok_or_else(|| {
            AppError::invalid_request(
                "The request needs \"revision\": the revision number this change was based on.",
            )
        })?;
    let (form, document) = document_of(&mut body)?;

    match store::update(&state.pool, &id, based_on, &form, &document).await? {
        UpdateOutcome::Updated(stored) => Ok(Json(record(stored)?)),
        UpdateOutcome::NotFound => Err(AppError::FormNotFound { id }),
        UpdateOutcome::Conflict { current } => {
            Err(AppError::RevisionConflict { based_on, current })
        }
    }
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if store::delete(&state.pool, &id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::FormNotFound { id })
    }
}

/// The request body as a JSON object. The body is read by hand, rather than
/// with axum's `Json` extractor, so that every failure uses the standard
/// error shape and a wrong `Content-Type` is not held against the caller.
fn request_object(body: Result<Bytes, BytesRejection>) -> Result<Map<String, Value>, AppError> {
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

/// Takes `document` out of the request and checks it. Returns it both typed
/// (to read the name from) and as sent (to store).
fn document_of(body: &mut Map<String, Value>) -> Result<(FormDocument, Value), AppError> {
    let document = body.remove("document").ok_or_else(|| {
        AppError::invalid_request("The request needs \"document\": the form document.")
    })?;
    match validate::validate(&document) {
        Ok(form) => Ok((form, document)),
        Err(details) => Err(AppError::InvalidForm { details }),
    }
}

/// The body of a successful read or write: `contracts::FormRecord`, with the
/// document passed through exactly as stored. It was checked when it was
/// written; a document written by a newer build still reaches the client,
/// which knows how to say that it cannot read it.
fn record(stored: StoredForm) -> Result<Value, AppError> {
    let document: Value = serde_json::from_str(&stored.document).map_err(|error| {
        tracing::error!(id = stored.id, "stored form document is not JSON: {error}");
        AppError::Internal
    })?;
    Ok(json!({
        "id": stored.id,
        "revision": stored.revision,
        "updatedAt": stored.updated_at,
        "document": document,
    }))
}
