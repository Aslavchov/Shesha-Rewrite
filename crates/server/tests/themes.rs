//! Drives `/api/theme` through the real router in memory, and checks that the
//! published theme is written into `index.html` (spec section 5, ADR 0010).

use std::borrow::Cow;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use contracts::{
    ApiError, MAX_JSON_DEPTH, MAX_REQUEST_BYTES, THEME_MAX_COMPONENTS, THEME_MAX_SLOTS,
    THEME_RADIUS_MAX, THEME_TEXT_SIZE_MAX, THEME_TEXT_SIZE_MIN, ThemeRecord, ThemeState,
};
use http_body_util::BodyExt;
use serde_json::{Map, Value, json};
use server::assets::AssetSource;
use server::{AppState, db, router};
use tempfile::TempDir;
use tower::ServiceExt;

const DRAFT: &str = "/api/theme/draft";
const PUBLISH: &str = "/api/theme/publish";
const DISCARD: &str = "/api/theme/discard";

/// What the frontend's build puts in `index.html` for the server to fill.
const MARKER: &str = r#"<script type="application/json" id="published-theme">null</script>"#;
const INDEX_BEFORE: &str = "<!doctype html><head><title>test index</title>";
const INDEX_AFTER: &str = "</head><body><div id=\"root\"></div></body>";

/// A frontend that is only its `index.html`.
struct IndexOnly(String);

impl AssetSource for IndexOnly {
    fn get(&self, path: &str) -> Option<Cow<'static, [u8]>> {
        (path == "index.html").then(|| Cow::Owned(self.0.clone().into_bytes()))
    }
}

fn index_with_marker() -> IndexOnly {
    IndexOnly(format!("{INDEX_BEFORE}{MARKER}{INDEX_AFTER}"))
}

/// The app with a fresh database and an `index.html` that has the theme
/// marker. Keep the `TempDir` alive for the test.
async fn app() -> (AppState, TempDir) {
    app_with(index_with_marker()).await
}

async fn app_with(assets: impl AssetSource) -> (AppState, TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let pool = db::prepare(&dir.path().join("test.db"), false)
        .await
        .unwrap();
    let state = AppState {
        pool,
        assets: Arc::new(assets),
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

async fn text(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

async fn json_body(response: Response) -> Value {
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
    serde_json::from_str(&text(response).await).unwrap()
}

/// Asserts the status and returns the body as the standard error shape.
async fn error(response: Response, status: StatusCode, code: &str) -> ApiError {
    assert_eq!(response.status(), status);
    let body: ApiError = serde_json::from_value(json_body(response).await).unwrap();
    assert_eq!(body.error.code, code);
    assert!(!body.error.message.is_empty());
    body
}

/// Asserts 200 and returns the body as a `ThemeState`.
async fn theme_state(response: Response) -> ThemeState {
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_value(json_body(response).await).unwrap()
}

/// `GET /api/theme`: the published theme.
async fn published(state: &AppState) -> ThemeRecord {
    let response = send(state, Method::GET, "/api/theme", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_value(json_body(response).await).unwrap()
}

/// `GET /api/theme/draft`: the published theme and the draft.
async fn draft(state: &AppState) -> ThemeState {
    theme_state(send(state, Method::GET, DRAFT, None).await).await
}

/// `GET /api/theme/draft` as JSON, to compare documents exactly as sent.
async fn draft_json(state: &AppState) -> Value {
    json_body(send(state, Method::GET, DRAFT, None).await).await
}

async fn save(state: &AppState, revision: u32, document: &Value) -> ThemeState {
    let body = json!({ "revision": revision, "document": document });
    theme_state(send(state, Method::PUT, DRAFT, Some(&body)).await).await
}

async fn publish(state: &AppState, revision: u32) -> ThemeState {
    let body = json!({ "revision": revision });
    theme_state(send(state, Method::POST, PUBLISH, Some(&body)).await).await
}

async fn discard(state: &AppState, revision: u32) -> ThemeState {
    let body = json!({ "revision": revision });
    theme_state(send(state, Method::POST, DISCARD, Some(&body)).await).await
}

fn empty() -> Value {
    json!({ "formatVersion": 1 })
}

fn teal() -> Value {
    json!({ "formatVersion": 1, "colors": { "primary": { "light": "#0F766E" } } })
}

fn typed(document: &Value) -> contracts::ThemeDocument {
    serde_json::from_value(document.clone()).unwrap()
}

/// Timestamps have millisecond precision; make sure the next one is later.
async fn tick() {
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
}

// --- Reads -------------------------------------------------------------

#[tokio::test]
async fn a_new_database_has_the_empty_theme_published_at_revision_1() {
    let (state, _dir) = app().await;

    let response = send(&state, Method::GET, "/api/theme", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;

    let updated_at = body["updatedAt"].as_str().unwrap();
    assert_eq!(updated_at.len(), "2026-11-15T09:15:02.417Z".len());
    assert!(updated_at.ends_with('Z'));
    assert_eq!(
        body,
        json!({ "revision": 1, "updatedAt": updated_at, "document": { "formatVersion": 1 } })
    );
}

#[tokio::test]
async fn a_new_database_has_a_draft_equal_to_the_published_theme() {
    let (state, _dir) = app().await;

    let body = draft_json(&state).await;

    let record = json!({
        "revision": 1,
        "updatedAt": body["published"]["updatedAt"],
        "document": { "formatVersion": 1 },
    });
    assert_eq!(
        body,
        json!({ "published": record, "draft": record, "unpublished": false })
    );
}

// --- Saving the draft --------------------------------------------------

#[tokio::test]
async fn saving_the_draft_returns_the_new_state_and_leaves_the_published_theme() {
    let (state, _dir) = app().await;
    let before = draft(&state).await;

    tick().await;
    let saved = save(&state, 1, &teal()).await;

    assert_eq!(saved.draft.revision, 2);
    assert_eq!(saved.draft.document, typed(&teal()));
    assert!(saved.draft.updated_at > before.draft.updated_at);
    assert_eq!(saved.published, before.published);
    assert!(saved.unpublished);
    assert_eq!(draft(&state).await, saved);
    assert_eq!(published(&state).await, before.published);
}

#[tokio::test]
async fn every_save_adds_one_to_the_draft_revision() {
    let (state, _dir) = app().await;

    assert_eq!(save(&state, 1, &teal()).await.draft.revision, 2);
    // Even when the document is the one already stored.
    assert_eq!(save(&state, 2, &teal()).await.draft.revision, 3);
    assert_eq!(save(&state, 3, &empty()).await.draft.revision, 4);
}

#[tokio::test]
async fn a_sparse_theme_comes_back_exactly_as_it_was_sent() {
    let (state, _dir) = app().await;
    let document = json!({
        "formatVersion": 1,
        "density": "compact",
        "colors": {
            "sidebar": { "dark": "#0a0a0a" },
            "primary": { "light": "#0F766E", "dark": "#5EEAD4" },
            "info": {},
        },
        "components": {
            "text-field": { "label": { "fontWeight": "semibold" }, "control": {} },
            "not-registered": { "root": { "background": { "token": "success" } } },
            "button": {},
        },
        "textSize": 15,
        "radius": 0,
    });

    save(&state, 1, &document).await;

    assert_eq!(draft_json(&state).await["draft"]["document"], document);
    // Key order is the author's, not alphabetical, and the component type
    // this server has never heard of is kept.
    let body = text(send(&state, Method::GET, DRAFT, None).await).await;
    assert!(
        body.contains(
            r##""colors":{"sidebar":{"dark":"#0a0a0a"},"primary":{"light":"#0F766E","dark":"#5EEAD4"},"info":{}}"##
        ),
        "{body}"
    );
    assert!(
        body.contains(r#""not-registered":{"root":{"background":{"token":"success"}}}"#),
        "{body}"
    );

    publish(&state, 2).await;
    let response = send(&state, Method::GET, "/api/theme", None).await;
    assert_eq!(json_body(response).await["document"], document);
}

#[tokio::test]
async fn a_stale_save_is_409_and_changes_nothing() {
    let (state, _dir) = app().await;
    let first = save(&state, 1, &teal()).await;

    let second = json!({ "revision": 1, "document": { "formatVersion": 1, "radius": 4 } });
    let response = send(&state, Method::PUT, DRAFT, Some(&second)).await;

    let conflict = error(response, StatusCode::CONFLICT, "revision_conflict").await;
    assert_eq!(
        conflict.error.message,
        "The theme draft has changed since revision 1: it is now at revision 2. Load it again and reapply the change."
    );
    assert_eq!(conflict.error.details, None);
    assert_eq!(draft(&state).await, first);

    // A revision from the future is just as stale.
    let ahead = json!({ "revision": 9, "document": empty() });
    let response = send(&state, Method::PUT, DRAFT, Some(&ahead)).await;
    error(response, StatusCode::CONFLICT, "revision_conflict").await;
    assert_eq!(draft(&state).await, first);
}

#[tokio::test]
async fn of_two_saves_from_the_same_revision_only_one_wins() {
    let (state, _dir) = app().await;
    let one = json!({ "revision": 1, "document": { "formatVersion": 1, "radius": 1 } });
    let two = json!({ "revision": 1, "document": { "formatVersion": 1, "radius": 2 } });

    let (first, second) = tokio::join!(
        send(&state, Method::PUT, DRAFT, Some(&one)),
        send(&state, Method::PUT, DRAFT, Some(&two)),
    );

    let mut statuses = [first.status(), second.status()];
    statuses.sort();
    assert_eq!(statuses, [StatusCode::OK, StatusCode::CONFLICT]);
    assert_eq!(draft(&state).await.draft.revision, 2);
}

// --- Publishing and discarding -----------------------------------------

#[tokio::test]
async fn publish_makes_the_draft_the_published_theme() {
    let (state, _dir) = app().await;
    let saved = save(&state, 1, &teal()).await;

    tick().await;
    let after = publish(&state, 2).await;

    assert_eq!(after.published.revision, 2);
    assert_eq!(after.published.document, typed(&teal()));
    assert!(after.published.updated_at > saved.published.updated_at);
    // The draft itself has not changed.
    assert_eq!(after.draft, saved.draft);
    assert!(!after.unpublished);
    assert_eq!(published(&state).await, after.published);
    assert_eq!(draft(&state).await, after);
}

#[tokio::test]
async fn publishing_a_draft_with_no_changes_changes_nothing() {
    let (state, _dir) = app().await;
    let before = draft(&state).await;

    tick().await;
    assert_eq!(publish(&state, 1).await, before);

    save(&state, 1, &teal()).await;
    let once = publish(&state, 2).await;
    tick().await;
    let twice = publish(&state, 2).await;
    assert_eq!(twice, once);
    assert_eq!(twice.published.revision, 2);
}

#[tokio::test]
async fn discard_puts_the_draft_back_to_the_published_theme() {
    let (state, _dir) = app().await;
    save(&state, 1, &teal()).await;
    publish(&state, 2).await;
    let changed = save(&state, 2, &json!({ "formatVersion": 1, "radius": 16 })).await;
    assert!(changed.unpublished);

    tick().await;
    let after = discard(&state, 3).await;

    assert_eq!(after.draft.revision, 4);
    assert_eq!(after.draft.document, typed(&teal()));
    assert!(after.draft.updated_at > changed.draft.updated_at);
    assert_eq!(after.published, changed.published);
    assert!(!after.unpublished);
    assert_eq!(draft(&state).await, after);
    assert_eq!(published(&state).await, changed.published);
}

#[tokio::test]
async fn discarding_a_draft_with_no_changes_changes_nothing() {
    let (state, _dir) = app().await;
    let before = draft(&state).await;

    tick().await;
    assert_eq!(discard(&state, 1).await, before);
    assert_eq!(draft(&state).await, before);
}

#[tokio::test]
async fn a_stale_publish_or_discard_is_409_and_changes_nothing() {
    let (state, _dir) = app().await;
    let saved = save(&state, 1, &teal()).await;

    for uri in [PUBLISH, DISCARD] {
        for stale in [1, 9] {
            let body = json!({ "revision": stale });
            let response = send(&state, Method::POST, uri, Some(&body)).await;
            let conflict = error(response, StatusCode::CONFLICT, "revision_conflict").await;
            assert_eq!(
                conflict.error.message,
                format!(
                    "The theme draft has changed since revision {stale}: it is now at revision 2. Load it again and reapply the change."
                ),
                "{uri}"
            );
            assert_eq!(draft(&state).await, saved, "{uri}");
        }
    }
    assert_eq!(published(&state).await.document, typed(&empty()));
}

#[tokio::test]
async fn unpublished_follows_whether_the_draft_differs_from_the_published_theme() {
    let (state, _dir) = app().await;
    assert!(!draft(&state).await.unpublished);

    assert!(save(&state, 1, &teal()).await.unpublished);
    assert!(draft(&state).await.unpublished);
    assert!(!publish(&state, 2).await.unpublished);
    assert!(!draft(&state).await.unpublished);

    assert!(
        save(&state, 2, &json!({ "formatVersion": 1, "radius": 2 }))
            .await
            .unpublished
    );
    assert!(!discard(&state, 3).await.unpublished);
    assert!(!draft(&state).await.unpublished);

    // Changing the draft back by hand is the same as discarding.
    assert!(save(&state, 4, &empty()).await.unpublished);
    assert!(!save(&state, 5, &teal()).await.unpublished);
}

#[tokio::test]
async fn documents_are_compared_as_json_not_as_text() {
    let (state, _dir) = app().await;
    save(
        &state,
        1,
        &json!({ "formatVersion": 1, "radius": 4, "textSize": 15 }),
    )
    .await;
    let before = publish(&state, 2).await;

    // The same theme with its members in another order.
    let reordered = json!({ "textSize": 15, "radius": 4, "formatVersion": 1 });
    let saved = save(&state, 2, &reordered).await;
    assert!(!saved.unpublished);

    // So there is nothing to publish.
    let after = publish(&state, 3).await;
    assert_eq!(after.published, before.published);
    assert_eq!(discard(&state, 3).await.draft.revision, 3);
}

// --- Requests that are refused ------------------------------------------

#[tokio::test]
async fn an_invalid_theme_is_400_with_every_problem_listed() {
    let (state, _dir) = app().await;
    let invalid = json!({
        "formatVersion": 1,
        "colors": { "primary": { "light": "blue" }, "accent": { "light": "#003BB2" } },
        "radius": 40,
    });
    let body = json!({ "revision": 1, "document": invalid });

    let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        json_body(response).await,
        json!({ "error": {
            "code": "invalid_theme",
            "message": "The theme has 3 problems.",
            "details": [
                {
                    "path": "colors.primary.light",
                    "message": "\"blue\" is not a colour. Use six hex digits, like #003BB2.",
                },
                {
                    "path": "colors.accent",
                    "message": "\"accent\" is not a colour role. The roles are primary, destructive, success, warning, info, background and sidebar.",
                },
                {
                    "path": "radius",
                    "message": "40 is not a radius. Use a whole number of pixels from 0 to 16.",
                },
            ],
        } })
    );

    // Nothing was stored, and the revision did not move.
    let stored = draft(&state).await;
    assert_eq!(stored.draft.revision, 1);
    assert_eq!(stored.draft.document, typed(&empty()));
}

#[tokio::test]
async fn one_problem_is_counted_in_the_singular() {
    let (state, _dir) = app().await;
    let body = json!({ "revision": 1, "document": { "formatVersion": 1, "density": "tight" } });

    let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;

    let error = error(response, StatusCode::BAD_REQUEST, "invalid_theme").await;
    assert_eq!(error.error.message, "The theme has 1 problem.");
}

/// An object with `count` members named `<prefix><n>`, each an empty object.
fn members(prefix: &str, count: u32) -> Value {
    (0..count)
        .map(|n| (format!("{prefix}{n}"), json!({})))
        .collect::<Map<String, Value>>()
        .into()
}

#[tokio::test]
async fn every_rule_is_checked_and_names_its_path() {
    let (state, _dir) = app().await;
    let too_many_components = members("type-", THEME_MAX_COMPONENTS + 1);
    let too_many_slots = members("slot", THEME_MAX_SLOTS + 1);
    let long = "x".repeat(65);
    let long_type_path = format!("components.{long}");
    let long_slot_path = format!("components.button.{long}");

    // What is put beside `formatVersion: 1`, and the paths of its problems.
    let cases: Vec<(Value, Vec<&str>)> = vec![
        // Top level.
        (json!({ "font": "Arial" }), vec!["font"]),
        (json!({ "name": "Mine", "id": 1 }), vec!["name", "id"]),
        // Colours.
        (json!({ "colors": [] }), vec!["colors"]),
        (json!({ "colors": null }), vec!["colors"]),
        (json!({ "colors": { "accent": {} } }), vec!["colors.accent"]),
        (
            json!({ "colors": { "Primary": { "light": "#003BB2" } } }),
            vec!["colors.Primary"],
        ),
        (
            json!({ "colors": { "primary": "#003BB2" } }),
            vec!["colors.primary"],
        ),
        (
            json!({ "colors": { "primary": { "medium": "#003BB2" } } }),
            vec!["colors.primary.medium"],
        ),
        (
            json!({ "colors": { "primary": { "light": "blue" } } }),
            vec!["colors.primary.light"],
        ),
        (
            json!({ "colors": { "primary": { "light": "#03B" } } }),
            vec!["colors.primary.light"],
        ),
        (
            json!({ "colors": { "destructive": { "dark": "#003BB2FF" } } }),
            vec!["colors.destructive.dark"],
        ),
        (
            json!({ "colors": { "success": { "light": "003BB2" } } }),
            vec!["colors.success.light"],
        ),
        (
            json!({ "colors": { "warning": { "dark": "#00ZZB2" } } }),
            vec!["colors.warning.dark"],
        ),
        (
            json!({ "colors": { "info": { "light": { "token": "primary" } } } }),
            vec!["colors.info.light"],
        ),
        (
            json!({ "colors": { "background": { "light": null } } }),
            vec!["colors.background.light"],
        ),
        (
            json!({ "colors": { "sidebar": { "light": "</script>", "dark": 0 } } }),
            vec!["colors.sidebar.light", "colors.sidebar.dark"],
        ),
        // Radius, text size and density.
        (json!({ "radius": THEME_RADIUS_MAX + 1 }), vec!["radius"]),
        (json!({ "radius": -1 }), vec!["radius"]),
        (json!({ "radius": 8.5 }), vec!["radius"]),
        (json!({ "radius": "8" }), vec!["radius"]),
        (json!({ "radius": null }), vec!["radius"]),
        (
            json!({ "textSize": THEME_TEXT_SIZE_MIN - 1 }),
            vec!["textSize"],
        ),
        (
            json!({ "textSize": THEME_TEXT_SIZE_MAX + 1 }),
            vec!["textSize"],
        ),
        (json!({ "textSize": 14.5 }), vec!["textSize"]),
        (json!({ "textSize": "14px" }), vec!["textSize"]),
        (json!({ "density": "tight" }), vec!["density"]),
        (json!({ "density": "Compact" }), vec!["density"]),
        (json!({ "density": 2 }), vec!["density"]),
        // Component defaults.
        (json!({ "components": [] }), vec!["components"]),
        (
            json!({ "components": too_many_components }),
            vec!["components"],
        ),
        (json!({ "components": { "": {} } }), vec!["components."]),
        (
            json!({ "components": { "text field": {} } }),
            vec!["components.text field"],
        ),
        (
            json!({ "components": { long.clone(): {} } }),
            vec![long_type_path.as_str()],
        ),
        (
            json!({ "components": { "button": [] } }),
            vec!["components.button"],
        ),
        (
            json!({ "components": { "button": too_many_slots } }),
            vec!["components.button"],
        ),
        (
            json!({ "components": { "button": { "the root": {} } } }),
            vec!["components.button.the root"],
        ),
        (
            json!({ "components": { "button": { long.clone(): {} } } }),
            vec![long_slot_path.as_str()],
        ),
        (
            json!({ "components": { "button": { "root": "#003BB2" } } }),
            vec!["components.button.root"],
        ),
        // Slot styles, as in a form.
        (
            json!({ "components": { "button": { "root": { "background": "red" } } } }),
            vec!["components.button.root.background"],
        ),
        (
            json!({ "components": { "button": { "root": { "color": "#12345" } } } }),
            vec!["components.button.root.color"],
        ),
        (
            json!({ "components": { "button": { "root": { "borderColor": { "token": "Primary Blue" } } } } }),
            vec!["components.button.root.borderColor"],
        ),
        (
            json!({ "components": { "button": { "root": { "radius": "huge" } } } }),
            vec!["components.button.root.radius"],
        ),
        (
            json!({ "components": { "button": { "root": { "fontWeight": "bold" } } } }),
            vec!["components.button.root.fontWeight"],
        ),
        (
            json!({ "components": { "button": { "root": { "padding": 12 } } } }),
            vec!["components.button.root.padding"],
        ),
        (
            json!({ "components": { "button": { "root": { "margin": "md" } } } }),
            vec!["components.button.root.margin"],
        ),
    ];

    for (extra, expected) in cases {
        let mut document = empty();
        for (key, value) in extra.as_object().unwrap() {
            document[key] = value.clone();
        }
        let body = json!({ "revision": 1, "document": document });
        let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;
        let error = error(response, StatusCode::BAD_REQUEST, "invalid_theme").await;

        let details = error.error.details.unwrap_or_default();
        let found: Vec<&str> = details.iter().map(|d| d.path.as_str()).collect();
        assert_eq!(found, expected, "{expected:?}");
        for detail in &details {
            assert!(detail.message.ends_with('.'), "{}", detail.message);
        }
    }

    // The theme itself, and its version.
    for (document, expected) in [
        (json!([]), ""),
        (json!("theme"), ""),
        (json!(null), ""),
        (json!({}), "formatVersion"),
        (json!({ "formatVersion": "1" }), "formatVersion"),
        (json!({ "formatVersion": 1.5 }), "formatVersion"),
        (json!({ "formatVersion": 0 }), "formatVersion"),
        (
            json!({ "formatVersion": 2, "palette": [] }),
            "formatVersion",
        ),
    ] {
        let body = json!({ "revision": 1, "document": document });
        let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;
        let error = error(response, StatusCode::BAD_REQUEST, "invalid_theme").await;
        let details = error.error.details.unwrap();
        assert_eq!(details.len(), 1, "{document}");
        assert_eq!(details[0].path, expected, "{document}");
    }

    // None of it was stored.
    assert_eq!(draft(&state).await.draft.revision, 1);
}

#[tokio::test]
async fn values_at_the_limits_and_empty_objects_are_accepted() {
    let (state, _dir) = app().await;
    let documents = [
        json!({ "formatVersion": 1, "radius": 0, "textSize": THEME_TEXT_SIZE_MIN }),
        json!({ "formatVersion": 1, "radius": THEME_RADIUS_MAX, "textSize": THEME_TEXT_SIZE_MAX }),
        json!({ "formatVersion": 1, "density": "compact" }),
        json!({ "formatVersion": 1, "density": "regular" }),
        json!({ "formatVersion": 1, "density": "comfortable" }),
        json!({ "formatVersion": 1, "colors": {} }),
        json!({ "formatVersion": 1, "colors": { "primary": {} } }),
        json!({ "formatVersion": 1, "colors": { "primary": { "light": "#abcdef", "dark": "#ABCDEF" } } }),
        json!({ "formatVersion": 1, "components": {} }),
        json!({ "formatVersion": 1, "components": { "button": {} } }),
        json!({ "formatVersion": 1, "components": { "button": { "root": {} } } }),
        json!({ "formatVersion": 1, "components": { "x".repeat(64): { "y".repeat(64): {} } } }),
        json!({ "formatVersion": 1, "components": members("type-", THEME_MAX_COMPONENTS) }),
        json!({ "formatVersion": 1, "components": { "button": members("slot", THEME_MAX_SLOTS) } }),
    ];

    for (revision, document) in (1..).zip(documents) {
        let body = json!({ "revision": revision, "document": document });
        let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;
        assert_eq!(response.status(), StatusCode::OK, "{document}");
        assert_eq!(draft_json(&state).await["draft"]["document"], document);
    }
}

// Spec check C4-15.
#[tokio::test]
async fn an_unknown_component_type_is_kept_and_only_the_bad_colour_is_refused() {
    let (state, _dir) = app().await;
    let unknown_type = json!({ "mystery-widget": { "root": { "background": "#003BB2" } } });

    let both = json!({
        "formatVersion": 1,
        "colors": { "primary": { "light": "not-a-colour" } },
        "components": unknown_type,
    });
    let body = json!({ "revision": 1, "document": both });
    let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        json_body(response).await,
        json!({ "error": {
            "code": "invalid_theme",
            "message": "The theme has 1 problem.",
            "details": [{
                "path": "colors.primary.light",
                "message": "\"not-a-colour\" is not a colour. Use six hex digits, like #003BB2.",
            }],
        } })
    );

    let only_unknown = json!({ "formatVersion": 1, "components": unknown_type });
    let saved = save(&state, 1, &only_unknown).await;
    assert!(
        saved
            .draft
            .document
            .components
            .contains_key("mystery-widget")
    );
    publish(&state, 2).await;
    let response = send(&state, Method::GET, "/api/theme", None).await;
    assert_eq!(json_body(response).await["document"], only_unknown);
}

#[tokio::test]
async fn a_body_that_cannot_be_used_is_400_invalid_request() {
    let (state, _dir) = app().await;

    let cases: Vec<(Method, &str, Body)> = vec![
        (Method::PUT, DRAFT, Body::from("{ not json")),
        (Method::PUT, DRAFT, Body::empty()),
        (Method::PUT, DRAFT, Body::from("[1, 2]")),
        (Method::PUT, DRAFT, Body::from("{}")),
        (
            Method::PUT,
            DRAFT,
            Body::from(json!({ "document": empty() }).to_string()),
        ),
        (
            Method::PUT,
            DRAFT,
            Body::from(json!({ "revision": "1", "document": empty() }).to_string()),
        ),
        (
            Method::PUT,
            DRAFT,
            Body::from(json!({ "revision": -1, "document": empty() }).to_string()),
        ),
        (
            Method::PUT,
            DRAFT,
            Body::from(json!({ "revision": 1 }).to_string()),
        ),
        (Method::POST, PUBLISH, Body::empty()),
        (Method::POST, PUBLISH, Body::from("{}")),
        (Method::POST, PUBLISH, Body::from("1")),
        (Method::POST, PUBLISH, Body::from(r#"{"revision":"1"}"#)),
        (Method::POST, DISCARD, Body::empty()),
        (Method::POST, DISCARD, Body::from("{}")),
        (Method::POST, DISCARD, Body::from(r#"{"revision":1.5}"#)),
    ];
    for (method, uri, body) in cases {
        let response = send_raw(&state, method, uri, body).await;
        let error = error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        assert_eq!(error.error.details, None, "{uri}");
    }
    assert_eq!(draft(&state).await.draft.revision, 1);
}

/// A save request padded with trailing spaces to exactly `bytes` long.
fn padded_request(bytes: usize) -> String {
    let mut body = json!({ "revision": 1, "document": teal() }).to_string();
    assert!(body.len() <= bytes);
    body.push_str(&" ".repeat(bytes - body.len()));
    body
}

#[tokio::test]
async fn a_body_over_the_size_limit_is_413_in_the_error_shape() {
    let (state, _dir) = app().await;
    let limit = MAX_REQUEST_BYTES as usize;

    for uri in [PUBLISH, DISCARD] {
        let over = Body::from(" ".repeat(limit + 1));
        let response = send_raw(&state, Method::POST, uri, over).await;
        error(response, StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large").await;
    }
    let over = Body::from(padded_request(limit + 1));
    let response = send_raw(&state, Method::PUT, DRAFT, over).await;
    error(response, StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large").await;
    assert_eq!(draft(&state).await.draft.revision, 1);

    let at_limit = Body::from(padded_request(limit));
    let response = send_raw(&state, Method::PUT, DRAFT, at_limit).await;
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn json_nested_deeper_than_the_shared_limit_is_400_invalid_request() {
    let (state, _dir) = app().await;
    // The body is level 1 and the document level 2; the rest is lists.
    let mut filler = json!(true);
    for _ in 0..MAX_JSON_DEPTH - 1 {
        filler = json!([filler]);
    }
    let body = json!({ "revision": 1, "document": { "formatVersion": 1, "radius": filler } });

    let response = send(&state, Method::PUT, DRAFT, Some(&body)).await;

    let error = error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
    assert!(
        error.error.message.contains("recursion limit"),
        "{}",
        error.error.message
    );
}

#[tokio::test]
async fn other_methods_on_theme_routes_are_405_in_the_error_shape() {
    let (state, _dir) = app().await;

    for (method, uri) in [
        (Method::PUT, "/api/theme"),
        (Method::POST, "/api/theme"),
        (Method::DELETE, "/api/theme"),
        (Method::POST, DRAFT),
        (Method::DELETE, DRAFT),
        (Method::GET, PUBLISH),
        (Method::PUT, PUBLISH),
        (Method::GET, DISCARD),
        (Method::DELETE, DISCARD),
    ] {
        let response = send(&state, method.clone(), uri, None).await;
        let body = error(
            response,
            StatusCode::METHOD_NOT_ALLOWED,
            "method_not_allowed",
        )
        .await;
        assert_eq!(body.error.details, None, "{method} {uri}");
    }
}

#[tokio::test]
async fn unknown_theme_paths_are_404_in_the_error_shape() {
    let (state, _dir) = app().await;

    for uri in [
        "/api/themes",
        "/api/theme/",
        "/api/theme/published",
        "/api/theme/draft/1",
        "/api/theme/publish/now",
    ] {
        let response = send(&state, Method::GET, uri, None).await;
        let body = error(response, StatusCode::NOT_FOUND, "not_found").await;
        assert!(body.error.message.contains(uri), "{uri}");
        assert_eq!(body.error.details, None, "{uri}");
    }
}

// --- Storage -----------------------------------------------------------

#[tokio::test]
async fn a_theme_from_a_newer_build_is_passed_through_untouched() {
    // An older build may meet a database written by a newer one. It hands the
    // theme to the client, which knows how to say it cannot read it.
    let (state, _dir) = app().await;
    let future = json!({ "formatVersion": 2, "palette": ["#003BB2"] });
    sqlx::query("UPDATE theme SET published_document = ?, draft_document = ?")
        .bind(future.to_string())
        .bind(future.to_string())
        .execute(&state.pool)
        .await
        .unwrap();

    let response = send(&state, Method::GET, "/api/theme", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["document"], future);

    let body = draft_json(&state).await;
    assert_eq!(body["draft"]["document"], future);
    assert_eq!(body["unpublished"], false);
}

#[tokio::test]
async fn the_theme_survives_reopening_the_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let state = AppState {
        pool: db::prepare(&path, false).await.unwrap(),
        assets: Arc::new(index_with_marker()),
    };
    save(&state, 1, &teal()).await;
    publish(&state, 2).await;
    let before = save(&state, 2, &json!({ "formatVersion": 1, "radius": 4 })).await;
    state.pool.close().await;

    let state = AppState {
        pool: db::prepare(&path, false).await.unwrap(),
        assets: Arc::new(index_with_marker()),
    };

    assert_eq!(draft(&state).await, before);
}

#[tokio::test]
async fn demo_puts_the_theme_back_to_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let state = AppState {
        pool: db::prepare(&path, true).await.unwrap(),
        assets: Arc::new(index_with_marker()),
    };
    save(&state, 1, &teal()).await;
    publish(&state, 2).await;
    save(&state, 2, &json!({ "formatVersion": 1, "radius": 4 })).await;
    assert_eq!(published(&state).await.document, typed(&teal()));
    state.pool.close().await;

    let state = AppState {
        pool: db::prepare(&path, true).await.unwrap(),
        assets: Arc::new(index_with_marker()),
    };

    let after = draft(&state).await;
    assert_eq!(after.published.revision, 1);
    assert_eq!(after.published.document, typed(&empty()));
    assert_eq!(after.draft.revision, 1);
    assert_eq!(after.draft.document, typed(&empty()));
    assert!(!after.unpublished);
    let response = send(&state, Method::GET, "/api/theme", None).await;
    assert_eq!(json_body(response).await["document"], empty());
}

// --- The published theme in index.html ----------------------------------

/// The JSON inside the theme element of the page at `uri`, after checking
/// that the rest of the page is untouched.
async fn inlined_theme(state: &AppState, uri: &str) -> Value {
    let response = send(state, Method::GET, uri, None).await;
    assert_eq!(response.status(), StatusCode::OK, "{uri}");
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
    let page = text(response).await;

    let (open, close) = MARKER.split_once("null").unwrap();
    let start = format!("{INDEX_BEFORE}{open}");
    let end = format!("{close}{INDEX_AFTER}");
    assert!(page.starts_with(&start), "{page}");
    assert!(page.ends_with(&end), "{page}");
    let inside = &page[start.len()..page.len() - end.len()];
    assert!(!inside.contains('<'), "{inside}");
    serde_json::from_str(inside).unwrap()
}

#[tokio::test]
async fn the_default_theme_is_written_into_index_html() {
    let (state, _dir) = app().await;
    let record = json_body(send(&state, Method::GET, "/api/theme", None).await).await;

    // The file itself and every path that falls back to it.
    for uri in ["/", "/index.html", "/themes", "/forms/42/edit"] {
        let theme = inlined_theme(&state, uri).await;
        assert_eq!(theme, record, "{uri}");
        assert_eq!(theme["revision"], 1);
        assert_eq!(theme["document"], empty());
    }
}

#[tokio::test]
async fn index_html_carries_the_theme_as_a_theme_record_in_one_line() {
    let (state, _dir) = app().await;
    let record = published(&state).await;

    let page = text(send(&state, Method::GET, "/", None).await).await;

    let expected = format!(
        r#"<script type="application/json" id="published-theme">{{"revision":1,"updatedAt":"{}","document":{{"formatVersion":1}}}}</script>"#,
        record.updated_at
    );
    assert!(page.contains(&expected), "{page}");
}

#[tokio::test]
async fn a_published_theme_is_written_into_index_html_and_a_draft_is_not() {
    let (state, _dir) = app().await;
    let document = json!({
        "formatVersion": 1,
        "colors": { "primary": { "light": "#0F766E" } },
        "components": { "button": { "root": { "background": { "token": "success" } } } },
    });

    save(&state, 1, &document).await;
    for uri in ["/", "/index.html", "/themes"] {
        let theme = inlined_theme(&state, uri).await;
        assert_eq!(
            theme["document"],
            empty(),
            "a draft is not published: {uri}"
        );
    }

    publish(&state, 2).await;
    let record = json_body(send(&state, Method::GET, "/api/theme", None).await).await;
    for uri in ["/", "/index.html", "/themes"] {
        let theme = inlined_theme(&state, uri).await;
        assert_eq!(theme, record, "{uri}");
        assert_eq!(theme["revision"], 2);
        assert_eq!(theme["document"], document);
    }

    // A later draft changes nothing on the page, and discarding it neither.
    save(&state, 2, &json!({ "formatVersion": 1, "radius": 0 })).await;
    assert_eq!(inlined_theme(&state, "/").await, record);
    discard(&state, 3).await;
    assert_eq!(inlined_theme(&state, "/").await, record);
}

#[tokio::test]
async fn text_that_could_close_the_script_element_is_escaped_on_the_page() {
    // Validation refuses such a theme, so it is put in the database by hand,
    // as a newer build with other rules might have left it.
    let (state, _dir) = app().await;
    let hostile =
        json!({ "formatVersion": 2, "note": "</script><script>alert(1)</script>\u{2028}" });
    sqlx::query("UPDATE theme SET published_document = ?")
        .bind(hostile.to_string())
        .execute(&state.pool)
        .await
        .unwrap();

    let page = text(send(&state, Method::GET, "/", None).await).await;

    assert_eq!(page.matches("</script>").count(), 1, "{page}");
    assert!(!page.contains("<script>alert"), "{page}");
    assert!(!page.contains('\u{2028}'), "{page}");
    assert_eq!(inlined_theme(&state, "/").await["document"], hostile);
}

#[tokio::test]
async fn head_reports_the_length_of_the_page_with_the_theme_in_it() {
    let (state, _dir) = app().await;
    let page = text(send(&state, Method::GET, "/themes", None).await).await;

    let response = send(&state, Method::HEAD, "/themes", None).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CONTENT_LENGTH],
        page.len().to_string()
    );
    assert!(text(response).await.is_empty());
}

#[tokio::test]
async fn an_index_html_without_the_marker_is_served_unchanged() {
    let index = format!("{INDEX_BEFORE}{INDEX_AFTER}");
    let (state, _dir) = app_with(IndexOnly(index.clone())).await;
    save(&state, 1, &teal()).await;
    publish(&state, 2).await;

    for uri in ["/", "/index.html", "/themes"] {
        let response = send(&state, Method::GET, uri, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(text(response).await, index, "{uri}");
    }
}

#[tokio::test]
async fn index_html_is_served_unchanged_when_the_theme_cannot_be_read() {
    let (state, _dir) = app().await;
    state.pool.close().await;

    for uri in ["/", "/index.html", "/themes"] {
        let response = send(&state, Method::GET, uri, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
        assert_eq!(
            text(response).await,
            format!("{INDEX_BEFORE}{MARKER}{INDEX_AFTER}"),
            "{uri}"
        );
    }
}
