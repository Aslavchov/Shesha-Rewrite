//! Drives `/api/forms` through the real router in memory (spec section 8,
//! ADR 0007).

use std::borrow::Cow;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use contracts::{ApiError, FormList, FormRecord};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use server::assets::AssetSource;
use server::forms::seed::PERSON_DETAILS_ID;
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
async fn app(demo: bool) -> (AppState, TempDir) {
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

async fn send(state: &AppState, method: Method, uri: &str, body: Option<&Value>) -> Response {
    let body = body.map_or_else(Body::empty, |json| Body::from(json.to_string()));
    send_raw(state, method, uri, body).await
}

async fn send_raw(state: &AppState, method: Method, uri: &str, body: Body) -> Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .unwrap();
    router(state.clone()).oneshot(request).await.unwrap()
}

async fn json_body(response: Response) -> Value {
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// Asserts the status and returns the body as the standard error shape.
async fn error(response: Response, status: StatusCode, code: &str) -> ApiError {
    assert_eq!(response.status(), status);
    let body: ApiError = serde_json::from_value(json_body(response).await).unwrap();
    assert_eq!(body.error.code, code);
    assert!(!body.error.message.is_empty());
    body
}

/// Asserts the status and returns the body as a `FormRecord`.
async fn record(response: Response, status: StatusCode) -> FormRecord {
    assert_eq!(response.status(), status);
    serde_json::from_value(json_body(response).await).unwrap()
}

fn document(name: &str) -> Value {
    json!({
        "formatVersion": 1,
        "name": name,
        "description": format!("About {name}"),
        "components": [
            { "id": "c_1", "type": "text-field", "name": "first", "bind": "first",
              "settings": { "label": "First", "zebra": 1, "apple": 2 } }
        ]
    })
}

async fn create(state: &AppState, name: &str) -> FormRecord {
    let body = json!({ "document": document(name) });
    record(
        send(state, Method::POST, "/api/forms", Some(&body)).await,
        StatusCode::CREATED,
    )
    .await
}

async fn list(state: &AppState) -> FormList {
    let response = send(state, Method::GET, "/api/forms", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_value(json_body(response).await).unwrap()
}

// --- Reads -------------------------------------------------------------

#[tokio::test]
async fn a_new_database_has_no_forms() {
    let (state, _dir) = app(false).await;

    let response = send(&state, Method::GET, "/api/forms", None).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await, json!({ "forms": [] }));
}

#[tokio::test]
async fn demo_seeds_the_person_details_form() {
    let (state, _dir) = app(true).await;

    let forms = list(&state).await.forms;
    assert_eq!(forms.len(), 1);
    assert_eq!(forms[0].id, PERSON_DETAILS_ID);
    assert_eq!(forms[0].name, "Person details");
    assert!(
        forms[0]
            .description
            .starts_with("Demo form covering every Phase 1 component.")
    );
    assert_eq!(forms[0].revision, 1);

    let uri = format!("/api/forms/{PERSON_DETAILS_ID}");
    let form = record(send(&state, Method::GET, &uri, None).await, StatusCode::OK).await;
    assert_eq!(form.id, PERSON_DETAILS_ID);
    assert_eq!(form.revision, 1);
    assert_eq!(form.updated_at, forms[0].updated_at);
    assert_eq!(form.document.name, "Person details");
    assert_eq!(form.document.components.len(), 7);
}

#[tokio::test]
async fn a_summary_has_exactly_the_documented_fields() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Leave request").await;

    let response = send(&state, Method::GET, "/api/forms", None).await;

    assert_eq!(
        json_body(response).await,
        json!({ "forms": [{
            "id": created.id,
            "name": "Leave request",
            "description": "About Leave request",
            "updatedAt": created.updated_at,
            "revision": 1,
        }] })
    );
}

#[tokio::test]
async fn the_list_is_most_recently_updated_first() {
    let (state, _dir) = app(false).await;
    let first = create(&state, "First").await;
    let second = create(&state, "Second").await;
    let third = create(&state, "Third").await;
    let ids = |forms: FormList| forms.forms.into_iter().map(|f| f.id).collect::<Vec<_>>();
    assert_eq!(
        ids(list(&state).await),
        [third.id.clone(), second.id.clone(), first.id.clone()]
    );

    // Timestamps have millisecond precision; make sure the update is later.
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let body = json!({ "revision": 1, "document": document("First, renamed") });
    let uri = format!("/api/forms/{}", first.id);
    record(
        send(&state, Method::PUT, &uri, Some(&body)).await,
        StatusCode::OK,
    )
    .await;

    assert_eq!(ids(list(&state).await), [first.id, third.id, second.id]);
}

#[tokio::test]
async fn an_unknown_id_is_404_form_not_found() {
    let (state, _dir) = app(true).await;
    let body = json!({ "revision": 1, "document": document("x") });

    for (method, body) in [
        (Method::GET, None),
        (Method::PUT, Some(&body)),
        (Method::DELETE, None),
    ] {
        let response = send(&state, method.clone(), "/api/forms/does-not-exist", body).await;
        let error = error(response, StatusCode::NOT_FOUND, "form_not_found").await;
        assert!(error.error.message.contains("does-not-exist"), "{method}");
        assert_eq!(error.error.details, None);
    }
}

// --- Writes ------------------------------------------------------------

#[tokio::test]
async fn create_returns_201_with_the_stored_document_at_revision_1() {
    let (state, _dir) = app(false).await;
    let body = json!({ "document": document("Leave request") });

    let response = send(&state, Method::POST, "/api/forms", Some(&body)).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let created = json_body(response).await;

    assert_eq!(created["revision"], 1);
    assert_eq!(created["document"], document("Leave request"));
    let id = created["id"].as_str().unwrap();
    assert_eq!(id.len(), 32);
    assert!(id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')));
    let updated_at = created["updatedAt"].as_str().unwrap();
    assert_eq!(updated_at.len(), "2026-11-13T09:15:02.417Z".len());
    assert!(updated_at.ends_with('Z'));

    let read = send(&state, Method::GET, &format!("/api/forms/{id}"), None).await;
    assert_eq!(read.status(), StatusCode::OK);
    assert_eq!(json_body(read).await, created);
}

#[tokio::test]
async fn the_document_comes_back_as_it_was_sent() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Ordered").await;

    let uri = format!("/api/forms/{}", created.id);
    let response = send(&state, Method::GET, &uri, None).await;
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8(bytes.to_vec()).unwrap();

    // Key order is the author's, not alphabetical.
    assert!(
        text.contains(r#""settings":{"label":"First","zebra":1,"apple":2}"#),
        "{text}"
    );
}

#[tokio::test]
async fn two_new_forms_get_different_ids() {
    let (state, _dir) = app(false).await;

    let first = create(&state, "Same").await;
    let second = create(&state, "Same").await;

    assert_ne!(first.id, second.id);
}

#[tokio::test]
async fn update_returns_the_new_revision_and_document() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Before").await;
    let uri = format!("/api/forms/{}", created.id);

    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let body = json!({ "revision": 1, "document": document("After") });
    let updated = record(
        send(&state, Method::PUT, &uri, Some(&body)).await,
        StatusCode::OK,
    )
    .await;

    assert_eq!(updated.id, created.id);
    assert_eq!(updated.revision, 2);
    assert_eq!(updated.document.name, "After");
    assert!(updated.updated_at > created.updated_at);

    let read = record(send(&state, Method::GET, &uri, None).await, StatusCode::OK).await;
    assert_eq!(read, updated);
    let summary = &list(&state).await.forms[0];
    assert_eq!(
        (summary.name.as_str(), summary.revision),
        ("After", 2),
        "the summary follows the document"
    );
}

#[tokio::test]
async fn a_stale_revision_is_409_and_changes_nothing() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Original").await;
    let uri = format!("/api/forms/{}", created.id);
    let first = json!({ "revision": 1, "document": document("First writer") });
    record(
        send(&state, Method::PUT, &uri, Some(&first)).await,
        StatusCode::OK,
    )
    .await;

    let second = json!({ "revision": 1, "document": document("Second writer") });
    let response = send(&state, Method::PUT, &uri, Some(&second)).await;

    let conflict = error(response, StatusCode::CONFLICT, "revision_conflict").await;
    assert!(conflict.error.message.contains("revision 2"));
    let read = record(send(&state, Method::GET, &uri, None).await, StatusCode::OK).await;
    assert_eq!(
        (read.revision, read.document.name.as_str()),
        (2, "First writer")
    );

    // A revision from the future is just as stale.
    let ahead = json!({ "revision": 9, "document": document("Ahead") });
    let response = send(&state, Method::PUT, &uri, Some(&ahead)).await;
    error(response, StatusCode::CONFLICT, "revision_conflict").await;
}

#[tokio::test]
async fn an_invalid_document_is_400_with_every_problem_listed() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Valid").await;
    let invalid = json!({
        "formatVersion": 1,
        "name": "Broken",
        "components": [
            { "id": "c_1", "type": "text-field", "name": "first name", "bind": "first" },
            { "id": "c_1", "type": "text-field", "name": "second", "bind": "first" },
        ]
    });
    let expected = json!([
        { "path": "components[0].name", "message": "…" },
        { "path": "components[1].id", "message": "…" },
        { "path": "components[1].bind", "message": "…" },
    ]);

    let post = json!({ "document": invalid });
    let put = json!({ "revision": 1, "document": invalid });
    for (method, uri, body) in [
        (Method::POST, "/api/forms".to_owned(), &post),
        (Method::PUT, format!("/api/forms/{}", created.id), &put),
    ] {
        let response = send(&state, method, &uri, Some(body)).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let mut body = json_body(response).await;

        assert_eq!(body["error"]["code"], "invalid_form");
        assert_eq!(
            body["error"]["message"],
            "The form document has 3 problems."
        );
        for detail in body["error"]["details"].as_array_mut().unwrap() {
            assert!(!detail["message"].as_str().unwrap().is_empty());
            detail["message"] = json!("…");
        }
        assert_eq!(body["error"]["details"], expected);
    }

    // Nothing was stored or changed.
    let forms = list(&state).await.forms;
    assert_eq!(forms.len(), 1);
    assert_eq!((forms[0].name.as_str(), forms[0].revision), ("Valid", 1));
}

#[tokio::test]
async fn a_body_that_cannot_be_used_is_400_invalid_request() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Valid").await;
    let uri = format!("/api/forms/{}", created.id);

    let cases: [(Method, &str, Body); 6] = [
        (Method::POST, "/api/forms", Body::from("{ not json")),
        (Method::POST, "/api/forms", Body::empty()),
        (Method::POST, "/api/forms", Body::from("[1, 2]")),
        (Method::POST, "/api/forms", Body::from("{}")),
        (
            Method::PUT,
            &uri,
            Body::from(json!({ "document": document("x") }).to_string()),
        ),
        (
            Method::PUT,
            &uri,
            Body::from(json!({ "revision": "1", "document": document("x") }).to_string()),
        ),
    ];
    for (method, uri, body) in cases {
        let response = send_raw(&state, method, uri, body).await;
        let error = error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        assert_eq!(error.error.details, None);
    }
}

#[tokio::test]
async fn a_body_over_the_size_limit_is_413_in_the_error_shape() {
    let (state, _dir) = app(false).await;
    let huge = "x".repeat(3 * 1024 * 1024);

    let response = send_raw(&state, Method::POST, "/api/forms", Body::from(huge)).await;

    error(response, StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large").await;
}

#[tokio::test]
async fn delete_returns_204_and_the_form_is_gone() {
    let (state, _dir) = app(false).await;
    let created = create(&state, "Short-lived").await;
    let uri = format!("/api/forms/{}", created.id);

    let response = send(&state, Method::DELETE, &uri, None).await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert!(bytes.is_empty());
    let read = send(&state, Method::GET, &uri, None).await;
    error(read, StatusCode::NOT_FOUND, "form_not_found").await;
    assert_eq!(list(&state).await.forms, []);
    let again = send(&state, Method::DELETE, &uri, None).await;
    error(again, StatusCode::NOT_FOUND, "form_not_found").await;
}

#[tokio::test]
async fn other_methods_on_form_routes_are_405_in_the_error_shape() {
    let (state, _dir) = app(false).await;

    for (method, uri) in [
        (Method::DELETE, "/api/forms"),
        (Method::PATCH, "/api/forms/abc"),
        (Method::POST, "/api/forms/abc"),
    ] {
        let response = send(&state, method, uri, None).await;
        error(
            response,
            StatusCode::METHOD_NOT_ALLOWED,
            "method_not_allowed",
        )
        .await;
    }
}

#[tokio::test]
async fn a_document_from_a_newer_build_is_passed_through_untouched() {
    // An older build may meet a database written by a newer one. It hands the
    // document to the client, which knows how to say it cannot read it.
    let (state, _dir) = app(false).await;
    let future = json!({ "formatVersion": 2, "title": "From the future", "tree": {} });
    sqlx::query(
        "INSERT INTO forms (id, name, description, document) VALUES ('future', 'F', '', ?)",
    )
    .bind(future.to_string())
    .execute(&state.pool)
    .await
    .unwrap();

    let response = send(&state, Method::GET, "/api/forms/future", None).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["document"], future);
}

#[tokio::test]
async fn demo_puts_the_forms_back_to_the_seed_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let state = AppState {
        pool: db::prepare(&path, true).await.unwrap(),
        assets: Arc::new(NoAssets),
    };
    create(&state, "Mine").await;
    let uri = format!("/api/forms/{PERSON_DETAILS_ID}");
    assert_eq!(
        send(&state, Method::DELETE, &uri, None).await.status(),
        StatusCode::NO_CONTENT
    );
    state.pool.close().await;

    let state = AppState {
        pool: db::prepare(&path, true).await.unwrap(),
        assets: Arc::new(NoAssets),
    };

    let forms = list(&state).await.forms;
    assert_eq!(forms.len(), 1);
    assert_eq!(forms[0].id, PERSON_DETAILS_ID);
}
