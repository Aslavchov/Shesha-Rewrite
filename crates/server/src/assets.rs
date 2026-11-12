//! Serves the built frontend (`web/dist`) for every path outside `/api`.

use std::borrow::Cow;

use axum::extract::State;
use axum::http::{HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use percent_encoding::percent_decode_str;
use rust_embed::RustEmbed;

use crate::router::AppState;

const INDEX: &str = "index.html";

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
        return file(path, data);
    }
    match assets.get(INDEX) {
        Some(data) => file(INDEX, data),
        None => frontend_missing(),
    }
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
