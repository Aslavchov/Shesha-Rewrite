//! The JSON API. Mounted at `/api` by `router.rs`.

use axum::extract::{OriginalUri, State};
use axum::http::{Method, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use contracts::{APP_NAME, AppInfo, DbStatus, HealthResponse};

use crate::error::AppError;
use crate::router::AppState;
use crate::{build_info, db};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/info", get(info))
        .fallback(not_found)
        .method_not_allowed_fallback(method_not_allowed)
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
