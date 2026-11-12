//! Drives the real router in memory: the API contract (spec 5.1) and how the
//! frontend is served. Frontend files are supplied by the test, so nothing
//! here depends on `web/dist` having been built.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::assets::AssetSource;
use server::{AppState, db, router};
use tempfile::TempDir;
use tower::ServiceExt;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const INDEX_HTML: &[u8] = b"<!doctype html><title>test index</title>";
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

struct MemoryAssets(HashMap<&'static str, &'static [u8]>);

impl AssetSource for MemoryAssets {
    fn get(&self, path: &str) -> Option<Cow<'static, [u8]>> {
        self.0.get(path).copied().map(Cow::Borrowed)
    }
}

/// A build of the frontend, in miniature.
fn frontend() -> MemoryAssets {
    MemoryAssets(HashMap::from([
        ("index.html", INDEX_HTML),
        ("assets/index-abc123.js", b"console.log(1)".as_slice()),
        ("assets/index-abc123.css", b"body{}".as_slice()),
        ("assets/inter-abc123.woff2", b"font".as_slice()),
        ("favicon.svg", b"<svg/>".as_slice()),
        ("my file.txt", b"spaced".as_slice()),
    ]))
}

struct NoAssets;

impl AssetSource for NoAssets {
    fn get(&self, _path: &str) -> Option<Cow<'static, [u8]>> {
        None
    }
}

struct PanickingAssets;

impl AssetSource for PanickingAssets {
    fn get(&self, _path: &str) -> Option<Cow<'static, [u8]>> {
        panic!("boom")
    }
}

/// The app with a fresh database. Keep the `TempDir` alive for the test.
async fn app(assets: impl AssetSource) -> (AppState, TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let pool = db::open(&dir.path().join("test.db")).await.unwrap();
    let state = AppState {
        pool,
        assets: Arc::new(assets),
    };
    (state, dir)
}

async fn send(state: &AppState, method: Method, uri: &str) -> Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    router(state.clone()).oneshot(request).await.unwrap()
}

async fn get(state: &AppState, uri: &str) -> Response {
    send(state, Method::GET, uri).await
}

fn header_of(response: &Response, name: header::HeaderName) -> &str {
    response
        .headers()
        .get(&name)
        .unwrap_or_else(|| panic!("no {name} header"))
        .to_str()
        .unwrap()
}

async fn bytes(response: Response) -> Vec<u8> {
    response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec()
}

async fn json_body(response: Response) -> Value {
    assert_eq!(
        header_of(&response, header::CONTENT_TYPE),
        "application/json"
    );
    serde_json::from_slice(&bytes(response).await).unwrap()
}

/// Asserts the standard error shape: exactly `{ error: { code, message } }`
/// with a non-empty message.
async fn assert_api_error(response: Response, status: StatusCode, code: &str) {
    assert_eq!(response.status(), status);
    let body = json_body(response).await;

    let message = body["error"]["message"]
        .as_str()
        .unwrap_or_else(|| panic!("no error.message in {body}"));
    assert!(!message.is_empty());
    assert_eq!(
        body,
        json!({ "error": { "code": code, "message": message } })
    );
}

// --- API ---------------------------------------------------------------

#[tokio::test]
async fn health_is_ok_when_the_database_answers() {
    let (state, _dir) = app(frontend()).await;

    let response = get(&state, "/api/health").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await,
        json!({ "status": "ok", "version": VERSION, "db": "ok" })
    );
}

#[tokio::test]
async fn health_is_503_when_the_database_is_unreachable() {
    let (state, _dir) = app(frontend()).await;
    state.pool.close().await;

    let response = get(&state, "/api/health").await;

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        json_body(response).await,
        json!({ "status": "error", "version": VERSION, "db": "error" })
    );
}

#[tokio::test]
async fn info_reports_name_version_and_commit() {
    let (state, _dir) = app(frontend()).await;

    let response = get(&state, "/api/info").await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let commit = body["commit"].as_str().expect("commit is a string");
    assert!(!commit.is_empty());
    assert_eq!(
        body,
        json!({ "name": contracts::APP_NAME, "version": VERSION, "commit": commit })
    );
}

#[tokio::test]
async fn unknown_api_paths_are_404_in_the_error_shape() {
    let (state, _dir) = app(frontend()).await;

    for uri in [
        "/api/nope",
        "/api/nope/deeper",
        "/api",
        "/api/",
        "/api/health/",
    ] {
        let response = get(&state, uri).await;
        assert_api_error(response, StatusCode::NOT_FOUND, "not_found").await;
    }
}

#[tokio::test]
async fn not_found_message_names_the_full_path() {
    let (state, _dir) = app(frontend()).await;

    let body = json_body(get(&state, "/api/nope").await).await;

    assert!(
        body["error"]["message"]
            .as_str()
            .unwrap()
            .contains("/api/nope")
    );
}

#[tokio::test]
async fn wrong_method_on_a_known_api_route_is_405_in_the_error_shape() {
    let (state, _dir) = app(frontend()).await;

    for uri in ["/api/health", "/api/info"] {
        for method in [Method::POST, Method::PUT, Method::DELETE] {
            let response = send(&state, method, uri).await;
            assert!(header_of(&response, header::ALLOW).contains("GET"));
            assert_api_error(
                response,
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            )
            .await;
        }
    }
}

#[tokio::test]
async fn a_panic_becomes_500_in_the_error_shape() {
    // Every frontend lookup panics, so any non-API request exercises the
    // panic handler that wraps the whole router.
    let (state, _dir) = app(PanickingAssets).await;

    let response = get(&state, "/anything").await;

    assert_api_error(
        response,
        StatusCode::INTERNAL_SERVER_ERROR,
        "internal_error",
    )
    .await;
}

// --- Frontend ----------------------------------------------------------

#[tokio::test]
async fn root_serves_index_html_uncached() {
    let (state, _dir) = app(frontend()).await;

    for uri in ["/", "/index.html"] {
        let response = get(&state, uri).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_of(&response, header::CONTENT_TYPE),
            "text/html; charset=utf-8"
        );
        assert_eq!(header_of(&response, header::CACHE_CONTROL), "no-cache");
        assert_eq!(bytes(response).await, INDEX_HTML);
    }
}

#[tokio::test]
async fn deep_links_fall_back_to_index_html() {
    let (state, _dir) = app(frontend()).await;

    for uri in ["/themes", "/forms/42/edit", "/nope", "/themes?tab=1"] {
        let response = get(&state, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(
            header_of(&response, header::CONTENT_TYPE),
            "text/html; charset=utf-8"
        );
        assert_eq!(header_of(&response, header::CACHE_CONTROL), "no-cache");
        assert_eq!(bytes(response).await, INDEX_HTML, "{uri}");
    }
}

#[tokio::test]
async fn only_api_and_api_slash_are_api_paths() {
    let (state, _dir) = app(frontend()).await;

    for uri in ["/apifoo", "/api-docs", "/apis/health"] {
        let response = get(&state, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(bytes(response).await, INDEX_HTML, "{uri}");
    }
}

#[tokio::test]
async fn hashed_assets_are_served_with_their_type_and_cached_forever() {
    let (state, _dir) = app(frontend()).await;

    for (uri, content_type, body) in [
        (
            "/assets/index-abc123.js",
            "text/javascript; charset=utf-8",
            b"console.log(1)".as_slice(),
        ),
        (
            "/assets/index-abc123.css",
            "text/css; charset=utf-8",
            b"body{}".as_slice(),
        ),
        (
            "/assets/inter-abc123.woff2",
            "font/woff2",
            b"font".as_slice(),
        ),
    ] {
        let response = get(&state, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(header_of(&response, header::CONTENT_TYPE), content_type);
        assert_eq!(header_of(&response, header::CACHE_CONTROL), IMMUTABLE);
        assert_eq!(bytes(response).await, body, "{uri}");
    }
}

#[tokio::test]
async fn other_files_are_served_uncached() {
    let (state, _dir) = app(frontend()).await;

    let response = get(&state, "/favicon.svg").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header_of(&response, header::CONTENT_TYPE), "image/svg+xml");
    assert_eq!(header_of(&response, header::CACHE_CONTROL), "no-cache");
    assert_eq!(bytes(response).await, b"<svg/>");
}

#[tokio::test]
async fn percent_encoded_paths_are_decoded() {
    let (state, _dir) = app(frontend()).await;

    let response = get(&state, "/my%20file.txt").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(bytes(response).await, b"spaced");
}

#[tokio::test]
async fn head_returns_the_headers_without_a_body() {
    let (state, _dir) = app(frontend()).await;

    let response = send(&state, Method::HEAD, "/themes").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        header_of(&response, header::CONTENT_LENGTH),
        INDEX_HTML.len().to_string()
    );
    assert!(bytes(response).await.is_empty());
}

#[tokio::test]
async fn frontend_paths_accept_only_get_and_head() {
    let (state, _dir) = app(frontend()).await;

    let response = send(&state, Method::POST, "/themes").await;

    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(header_of(&response, header::ALLOW), "GET, HEAD");
}

#[tokio::test]
async fn without_a_frontend_build_there_is_a_hint_and_the_api_still_works() {
    let (state, _dir) = app(NoAssets).await;

    let response = get(&state, "/").await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(header_of(&response, header::CONTENT_TYPE).starts_with("text/plain"));
    let hint = String::from_utf8(bytes(response).await).unwrap();
    assert!(hint.contains("npm run build") && hint.contains("Vite dev server"));

    assert_eq!(get(&state, "/api/health").await.status(), StatusCode::OK);
}
