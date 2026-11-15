//! Serves the built frontend (`web/dist`) for every path outside `/api`.

use std::borrow::Cow;

use axum::extract::State;
use axum::http::{HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use percent_encoding::percent_decode_str;
use rust_embed::RustEmbed;

use crate::router::AppState;
use crate::themes;

const INDEX: &str = "index.html";

/// Where `index.html` carries the published theme. The frontend's build
/// writes this element with `null` in it; the page is served with the theme
/// in its place, so the theme is applied before first paint and a reload
/// never shows the built-in look first (ADR 0010).
const THEME_MARKER: &str = r#"<script type="application/json" id="published-theme">null</script>"#;
const THEME_PLACEHOLDER: &str = "null";

/// Vite puts content-hashed files here, so they can be cached forever.
const HASHED_PREFIX: &str = "assets/";
const CACHE_FOREVER: &str = "public, max-age=31536000, immutable";
const CACHE_REVALIDATE: &str = "no-cache";

/// Where frontend files come from. A trait so tests can supply their own
/// files instead of depending on a frontend build.
pub trait AssetSource: Send + Sync + 'static {
    /// The file at `path` (relative, `/`-separated, no leading slash).
    fn get(&self, path: &str) -> Option<Cow<'static, [u8]>>;
}

/// `web/dist`. Release builds compile the files into the binary; debug
/// builds read them from disk on each request, which is why the folder is
/// allowed to be missing at compile time (`build.rs` insists on it for
/// release builds).
#[derive(RustEmbed)]
#[folder = "../../web/dist"]
#[allow_missing = true]
struct Dist;

pub struct EmbeddedAssets;

impl AssetSource for EmbeddedAssets {
    fn get(&self, path: &str) -> Option<Cow<'static, [u8]>> {
        Dist::get(path).map(|file| file.data)
    }
}

/// The router's fallback: the matching file if there is one, otherwise
/// `index.html` so the frontend's router can handle deep links.
pub async fn serve(State(state): State<AppState>, method: Method, uri: Uri) -> Response {
    if method != Method::GET && method != Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }

    let assets = state.assets.as_ref();
    let requested = percent_decode_str(uri.path().trim_start_matches('/'))
        .decode_utf8()
        .ok();
    if let Some(path) = requested.as_deref().filter(|path| !path.is_empty())
        && let Some(data) = assets.get(path)
    {
        let data = if path == INDEX {
            with_published_theme(&state, data).await
        } else {
            data
        };
        return file(path, data);
    }
    match assets.get(INDEX) {
        Some(data) => file(INDEX, with_published_theme(&state, data).await),
        None => frontend_missing(),
    }
}

/// `index.html` with the published theme written into its marker, as the
/// JSON of a `contracts::ThemeRecord`. Without the marker, or when the theme
/// cannot be read, the file is served as it is and the frontend asks the API.
async fn with_published_theme(state: &AppState, index: Cow<'static, [u8]>) -> Cow<'static, [u8]> {
    let Some(marker_at) = find(&index, THEME_MARKER.as_bytes()) else {
        return index;
    };
    let theme = match themes::published_json(&state.pool).await {
        Ok(theme) => script_safe_json(&theme),
        Err(_) => {
            tracing::warn!("the published theme could not be read; serving the page without it");
            return index;
        }
    };

    let marker_end = marker_at + THEME_MARKER.len();
    let (before, after) = THEME_MARKER
        .split_once(THEME_PLACEHOLDER)
        .expect("the marker holds the placeholder");
    let mut page = Vec::with_capacity(index.len() + theme.len());
    page.extend_from_slice(&index[..marker_at]);
    page.extend_from_slice(before.as_bytes());
    page.extend_from_slice(theme.as_bytes());
    page.extend_from_slice(after.as_bytes());
    page.extend_from_slice(&index[marker_end..]);
    Cow::Owned(page)
}

/// Where `needle` first occurs in `haystack`.
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Makes JSON text safe to write inside a `<script>` element. `<` becomes
/// `\u003c`, so the text can never hold `</script>` or `<!--`; U+2028 and
/// U+2029 are escaped too, since older JavaScript engines read them as line
/// ends. In JSON all three can only occur inside strings, where the escapes
/// mean the same characters, so the result parses to the same value.
pub fn script_safe_json(json: &str) -> String {
    let mut safe = String::with_capacity(json.len());
    for c in json.chars() {
        match c {
            '<' => safe.push_str("\\u003c"),
            '\u{2028}' => safe.push_str("\\u2028"),
            '\u{2029}' => safe.push_str("\\u2029"),
            c => safe.push(c),
        }
    }
    safe
}

fn file(path: &str, data: Cow<'static, [u8]>) -> Response {
    let cache = if path.starts_with(HASHED_PREFIX) {
        CACHE_FOREVER
    } else {
        CACHE_REVALIDATE
    };
    (
        [
            (header::CONTENT_TYPE, content_type(path)),
            (header::CACHE_CONTROL, HeaderValue::from_static(cache)),
        ],
        data,
    )
        .into_response()
}

fn content_type(path: &str) -> HeaderValue {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let value = if mime.type_() == mime_guess::mime::TEXT {
        format!("{mime}; charset=utf-8")
    } else {
        mime.to_string()
    };
    HeaderValue::from_str(&value).expect("MIME types are valid header values")
}

/// Only reachable in a debug build with no `web/dist`.
fn frontend_missing() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The frontend has not been built. Run `npm run build` in web/, \
         or open the Vite dev server instead.\n",
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    #[test]
    fn script_safe_json_cannot_close_the_script_element() {
        let value = json!({ "a": "</script><script>alert(1)</script>", "b": "<!-- x -->" });

        let safe = script_safe_json(&value.to_string());

        assert!(!safe.contains('<'), "{safe}");
        assert!(safe.contains(r"\u003c/script>"), "{safe}");
        assert_eq!(serde_json::from_str::<Value>(&safe).unwrap(), value);
    }

    #[test]
    fn script_safe_json_escapes_the_unicode_line_separators() {
        let value = json!({ "text": "one\u{2028}two\u{2029}three" });

        let safe = script_safe_json(&value.to_string());

        assert!(!safe.contains('\u{2028}') && !safe.contains('\u{2029}'));
        assert!(safe.contains(r"one\u2028two\u2029three"), "{safe}");
        assert_eq!(serde_json::from_str::<Value>(&safe).unwrap(), value);
    }

    #[test]
    fn script_safe_json_leaves_other_text_alone() {
        let json =
            r##"{"revision":3,"document":{"colors":{"primary":{"light":"#0F766E"}}},"é":"ü > &"}"##;

        assert_eq!(script_safe_json(json), json);
    }

    #[test]
    fn find_locates_the_first_occurrence() {
        assert_eq!(find(b"abcabc", b"bc"), Some(1));
        assert_eq!(find(b"abc", b"abcd"), None);
        assert_eq!(find(b"abc", b"x"), None);
    }
}
