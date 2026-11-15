//! `/api/theme`: the app's one theme, as published and as a draft (ADR 0010).

pub mod store;
pub mod validate;

use axum::body::Bytes;
use axum::extract::State;
use axum::extract::rejection::BytesRejection;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};
use sqlx::SqlitePool;

use crate::api::{based_on_revision, request_object};
use crate::error::AppError;
use crate::router::AppState;
use store::{StoredRecord, StoredTheme, WriteOutcome};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/theme", get(read_published))
        .route("/theme/draft", get(read_draft).put(save_draft))
        .route("/theme/publish", post(publish))
        .route("/theme/discard", post(discard))
}

async fn read_published(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let theme = store::get(&state.pool).await?;
    Ok(Json(record(&theme.published)?))
}

async fn read_draft(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let theme = store::get(&state.pool).await?;
    Ok(Json(theme_state(&theme)?))
}

async fn save_draft(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, AppError> {
    let mut body = request_object(body)?;
    let based_on = based_on_revision(&body)?;
    let document = body
        .remove("document")
        .ok_or_else(|| AppError::invalid_request("The request needs \"document\": the theme."))?;
    validate::validate(&document).map_err(|details| AppError::InvalidTheme { details })?;

    written(
        store::save_draft(&state.pool, based_on, &document).await?,
        based_on,
    )
}

async fn publish(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, AppError> {
    let based_on = based_on_revision(&request_object(body)?)?;
    written(store::publish(&state.pool, based_on).await?, based_on)
}

async fn discard(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, AppError> {
    let based_on = based_on_revision(&request_object(body)?)?;
    written(store::discard(&state.pool, based_on).await?, based_on)
}

/// The answer to a write: the theme as it now is, or the conflict.
fn written(outcome: WriteOutcome, based_on: u32) -> Result<Json<Value>, AppError> {
    match outcome {
        WriteOutcome::Done(theme) => Ok(Json(theme_state(&theme)?)),
        WriteOutcome::Conflict { current } => {
            Err(AppError::ThemeRevisionConflict { based_on, current })
        }
    }
}

/// The published theme as the JSON of a `contracts::ThemeRecord`, for the
/// page itself to carry (see `assets.rs`).
pub async fn published_json(pool: &SqlitePool) -> Result<String, AppError> {
    let theme = store::get(pool).await?;
    Ok(record(&theme.published)?.to_string())
}

/// `contracts::ThemeState`, with both documents passed through exactly as
/// stored.
fn theme_state(theme: &StoredTheme) -> Result<Value, AppError> {
    Ok(json!({
        "published": record(&theme.published)?,
        "draft": record(&theme.draft)?,
        "unpublished": theme.unpublished(),
    }))
}

/// `contracts::ThemeRecord`, with the document passed through exactly as
/// stored. It was checked when it was written; a theme written by a newer
/// build still reaches the client, which knows how to say that it cannot
/// read it.
fn record(stored: &StoredRecord) -> Result<Value, AppError> {
    let document: Value = serde_json::from_str(&stored.document).map_err(|error| {
        tracing::error!("stored theme document is not JSON: {error}");
        AppError::Internal
    })?;
    Ok(json!({
        "revision": stored.revision,
        "updatedAt": stored.updated_at,
        "document": document,
    }))
}
