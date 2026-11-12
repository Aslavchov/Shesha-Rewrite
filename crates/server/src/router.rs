//! Assembles the whole application: `/api`, the frontend, and the layers
//! shared by both.

use std::any::Any;
use std::sync::Arc;

use axum::Router;
use axum::response::{IntoResponse, Response};
use sqlx::SqlitePool;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::api;
use crate::assets::{self, AssetSource};
use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub assets: Arc<dyn AssetSource>,
}

pub fn router(state: AppState) -> Router {
    // `nest_service` hands exactly `/api`, `/api/` and `/api/...` to the API
    // router, which then answers its own 404s. (`nest` would let `/api/`
    // slip through to the frontend.) A path like `/apifoo` is not claimed.
    Router::new()
        .nest_service("/api", api::router().with_state(state.clone()))
        .fallback(assets::serve)
        .layer(CatchPanicLayer::custom(panic_response))
        // Outermost, so requests that end in a panic are logged too. Info
        // level, because that is the level the server logs at by default.
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state)
}

fn panic_response(panic: Box<dyn Any + Send + 'static>) -> Response {
    let detail = panic
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| panic.downcast_ref::<&str>().copied())
        .unwrap_or("no message");
    tracing::error!("request handler panicked: {detail}");
    AppError::Internal.into_response()
}
