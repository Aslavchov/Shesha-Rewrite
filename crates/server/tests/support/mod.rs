//! What the Phase 5 test files share: the app on a fresh database, and
//! requests driven through the real router in memory.
#![allow(dead_code)]

use std::borrow::Cow;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use contracts::ApiError;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::assets::AssetSource;
use server::{AppState, db, router};
use tempfile::TempDir;
use tower::ServiceExt;

struct NoAssets;

impl AssetSource for NoAssets {
    fn get(&self, _path: &str) -> Option<Cow<'static, [u8]>> {
        None
    }
}

/// The app with a fresh database; seeded as `--demo` does when `demo` is set.
/// Keep the `TempDir` alive for the test.
pub async fn app(demo: bool) -> (AppState, TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let pool = db::prepare(&dir.path().join("test.db"), demo)
        .await
        .unwrap();
    let state = AppState {
        pool,
        assets: Arc::new(NoAssets),
    };
    (state, dir)
}

pub async fn send(state: &AppState, method: Method, uri: &str, body: Option<&Value>) -> Response {
    let body = body.map_or_else(Body::empty, |json| Body::from(json.to_string()));
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .unwrap();
    router(state.clone()).oneshot(request).await.unwrap()
}

pub async fn json_body(response: Response) -> Value {
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// Sends a request and returns the body of the answer, which must have `status`.
pub async fn ok(
    state: &AppState,
    method: Method,
    uri: &str,
    body: Option<&Value>,
    status: StatusCode,
) -> Value {
    let response = send(state, method, uri, body).await;
    let found = response.status();
    let body = json_body(response).await;
    assert_eq!(found, status, "{uri}: {body}");
    body
}

pub async fn get(state: &AppState, uri: &str) -> Value {
    ok(state, Method::GET, uri, None, StatusCode::OK).await
}

/// Sends a request that must be refused with `status` and `code`, and
/// returns the standard error body.
pub async fn refused(
    state: &AppState,
    method: Method,
    uri: &str,
    body: Option<&Value>,
    status: StatusCode,
    code: &str,
) -> ApiError {
    let response = send(state, method, uri, body).await;
    let found = response.status();
    let body = json_body(response).await;
    assert_eq!(found, status, "{uri}: {body}");
    let error: ApiError = serde_json::from_value(body).unwrap();
    assert_eq!(error.error.code, code, "{uri}: {}", error.error.message);
    assert!(!error.error.message.is_empty());
    error
}

/// The paths of an error's details, in the order the server listed them.
pub fn paths(error: &ApiError) -> Vec<&str> {
    error
        .error
        .details
        .iter()
        .flatten()
        .map(|detail| detail.path.as_str())
        .collect()
}

/// The message of the detail at `path`.
pub fn message_at<'a>(error: &'a ApiError, path: &str) -> &'a str {
    error
        .error
        .details
        .iter()
        .flatten()
        .find(|detail| detail.path == path)
        .map(|detail| detail.message.as_str())
        .unwrap_or_else(|| panic!("no detail at {path}: {error:?}"))
}

/// Runs a list query and returns the page.
pub async fn query(state: &AppState, entity: &str, query: Value) -> Value {
    let uri = format!("/api/data/{entity}/query");
    ok(state, Method::POST, &uri, Some(&query), StatusCode::OK).await
}

/// The ids of a page's rows, in order.
pub fn ids(page: &Value) -> Vec<&str> {
    page["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap())
        .collect()
}

/// One value of every row of a page, in order.
pub fn column<'a>(page: &'a Value, property: &str) -> Vec<&'a Value> {
    page["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| &row["values"][property])
        .collect()
}

pub async fn create_row(state: &AppState, entity: &str, values: Value) -> Value {
    let uri = format!("/api/data/{entity}");
    let body = json!({ "values": values });
    ok(state, Method::POST, &uri, Some(&body), StatusCode::CREATED).await
}

pub async fn create_entity(state: &AppState, definition: Value) -> Value {
    let body = json!({ "definition": definition });
    ok(
        state,
        Method::POST,
        "/api/entities",
        Some(&body),
        StatusCode::CREATED,
    )
    .await
}

pub async fn create_list(state: &AppState, definition: Value) -> Value {
    let body = json!({ "definition": definition });
    ok(
        state,
        Method::POST,
        "/api/reference-lists",
        Some(&body),
        StatusCode::CREATED,
    )
    .await
}

/// Saves a changed definition of an entity, based on its current revision.
pub async fn put_entity(state: &AppState, name: &str, change: impl FnOnce(&mut Value)) -> Response {
    let uri = format!("/api/entities/{name}");
    let current = get(state, &uri).await;
    let mut definition = current["definition"].clone();
    change(&mut definition);
    let body = json!({ "revision": current["revision"], "definition": definition });
    send(state, Method::PUT, &uri, Some(&body)).await
}

/// The property of a definition by name, to change in place.
pub fn property<'a>(definition: &'a mut Value, name: &str) -> &'a mut Value {
    definition["properties"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|property| property["name"] == name)
        .unwrap_or_else(|| panic!("no property {name}"))
}

/// The body of an answer that must have `status`.
pub async fn expect_status(response: Response, status: StatusCode) -> Value {
    let found = response.status();
    let body = json_body(response).await;
    assert_eq!(found, status, "{body}");
    body
}

/// The standard error body of an answer that must be a refusal with `status`
/// and `code`.
pub async fn expect_refused(response: Response, status: StatusCode, code: &str) -> ApiError {
    let body = expect_status(response, status).await;
    let error: ApiError = serde_json::from_value(body).unwrap();
    assert_eq!(error.error.code, code, "{}", error.error.message);
    assert!(!error.error.message.is_empty());
    error
}

/// As `put_entity`, with values for the rows that have none.
pub async fn put_entity_with_fill(
    state: &AppState,
    name: &str,
    fill: Value,
    change: impl FnOnce(&mut Value),
) -> Response {
    let uri = format!("/api/entities/{name}");
    let current = get(state, &uri).await;
    let mut definition = current["definition"].clone();
    change(&mut definition);
    let body = json!({
        "revision": current["revision"],
        "definition": definition,
        "fill": fill
    });
    send(state, Method::PUT, &uri, Some(&body)).await
}

/// Saves a changed definition of a reference list, based on its current
/// revision.
pub async fn put_list(state: &AppState, name: &str, change: impl FnOnce(&mut Value)) -> Response {
    let uri = format!("/api/reference-lists/{name}");
    let current = get(state, &uri).await;
    let mut definition = current["definition"].clone();
    change(&mut definition);
    let body = json!({ "revision": current["revision"], "definition": definition });
    send(state, Method::PUT, &uri, Some(&body)).await
}

/// Every row of an entity with every property, in the default order.
pub async fn all_rows(state: &AppState, entity: &str) -> Vec<Value> {
    let page = query(state, entity, json!({ "pageSize": 200 })).await;
    assert!(page["total"].as_u64().unwrap() <= 200, "more than one page");
    page["rows"].as_array().unwrap().clone()
}

/// Sends a request that must answer 204 with no body.
pub async fn no_content(state: &AppState, method: Method, uri: &str) {
    let response = send(state, method, uri, None).await;
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        status,
        StatusCode::NO_CONTENT,
        "{uri}: {}",
        String::from_utf8_lossy(&bytes)
    );
    assert!(bytes.is_empty());
}

/// The names of the tables the database has.
pub async fn tables(state: &AppState) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .fetch_all(&state.pool)
        .await
        .unwrap()
}
