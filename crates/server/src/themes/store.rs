//! The theme in the database: one row holding the published document and the
//! draft, each stored as the JSON it was sent as.

use serde_json::Value;
use sqlx::SqlitePool;

/// One of the theme's two documents as stored. `document` is the JSON text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredRecord {
    pub revision: u32,
    pub updated_at: String,
    pub document: String,
}

/// The theme as stored: what is published, and the draft.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredTheme {
    pub published: StoredRecord,
    pub draft: StoredRecord,
}

impl StoredTheme {
    /// Whether the draft differs from what is published. The documents are
    /// compared as JSON, so the order of keys and the spacing do not count.
    pub fn unpublished(&self) -> bool {
        let json = |text: &str| serde_json::from_str::<Value>(text).ok();
        match (json(&self.published.document), json(&self.draft.document)) {
            (Some(published), Some(draft)) => published != draft,
            _ => self.published.document != self.draft.document,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteOutcome {
    Done(StoredTheme),
    /// The write was based on a draft revision that is no longer the current
    /// one.
    Conflict {
        current: u32,
    },
}

// Every statement is written out in full: sqlx takes only literal SQL.
// Timestamps are UTC, RFC 3339 with milliseconds, as in the migration.

const SELECT: &str = "SELECT published_revision, published_at, published_document, \
     draft_revision, draft_updated_at, draft_document \
     FROM theme WHERE id = 1";

const SAVE_DRAFT: &str = "UPDATE theme SET draft_document = ?, draft_revision = draft_revision + 1, \
     draft_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
     WHERE id = 1 AND draft_revision = ? \
     RETURNING published_revision, published_at, published_document, \
     draft_revision, draft_updated_at, draft_document";

const PUBLISH: &str = "UPDATE theme SET published_document = draft_document, \
     published_revision = published_revision + 1, \
     published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
     WHERE id = 1 AND draft_revision = ? AND published_revision = ? \
     RETURNING published_revision, published_at, published_document, \
     draft_revision, draft_updated_at, draft_document";

const DISCARD: &str = "UPDATE theme SET draft_document = published_document, \
     draft_revision = draft_revision + 1, \
     draft_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
     WHERE id = 1 AND draft_revision = ? AND published_revision = ? \
     RETURNING published_revision, published_at, published_document, \
     draft_revision, draft_updated_at, draft_document";

type ThemeRow = (u32, String, String, u32, String, String);

fn stored(row: ThemeRow) -> StoredTheme {
    let (published_revision, published_at, published_document, draft_revision, draft_at, draft) =
        row;
    StoredTheme {
        published: StoredRecord {
            revision: published_revision,
            updated_at: published_at,
            document: published_document,
        },
        draft: StoredRecord {
            revision: draft_revision,
            updated_at: draft_at,
            document: draft,
        },
    }
}

/// The theme. The migration creates its row, so there always is one.
pub async fn get(pool: &SqlitePool) -> Result<StoredTheme, sqlx::Error> {
    let row: ThemeRow = sqlx::query_as(SELECT).fetch_one(pool).await?;
    Ok(stored(row))
}

/// Replaces the draft if `based_on` is still its revision. The check and the
/// write are one statement, so two saves cannot both win.
pub async fn save_draft(
    pool: &SqlitePool,
    based_on: u32,
    document: &Value,
) -> Result<WriteOutcome, sqlx::Error> {
    let row: Option<ThemeRow> = sqlx::query_as(SAVE_DRAFT)
        .bind(document.to_string())
        .bind(based_on)
        .fetch_optional(pool)
        .await?;
    match row {
        Some(row) => Ok(WriteOutcome::Done(stored(row))),
        None => conflict(pool).await,
    }
}

/// Makes the draft the published theme, if `based_on` is still the draft's
/// revision. Publishing a draft that is already what is published changes
/// nothing.
pub async fn publish(pool: &SqlitePool, based_on: u32) -> Result<WriteOutcome, sqlx::Error> {
    copy(pool, based_on, PUBLISH).await
}

/// Puts the draft back to the published theme, if `based_on` is still the
/// draft's revision. Discarding a draft with no changes changes nothing.
pub async fn discard(pool: &SqlitePool, based_on: u32) -> Result<WriteOutcome, sqlx::Error> {
    copy(pool, based_on, DISCARD).await
}

/// Copies one document over the other with `update` (`PUBLISH` or
/// `DISCARD`), unless the two are already the same.
///
/// Whether they are the same is judged here, on the JSON, so the write names
/// both revisions it was judged at: it only happens if neither document has
/// changed since. When one has, the theme is read and judged again.
async fn copy(
    pool: &SqlitePool,
    based_on: u32,
    update: &'static str,
) -> Result<WriteOutcome, sqlx::Error> {
    loop {
        let theme = get(pool).await?;
        if theme.draft.revision != based_on {
            return Ok(WriteOutcome::Conflict {
                current: theme.draft.revision,
            });
        }
        if !theme.unpublished() {
            return Ok(WriteOutcome::Done(theme));
        }
        let row: Option<ThemeRow> = sqlx::query_as(update)
            .bind(based_on)
            .bind(theme.published.revision)
            .fetch_optional(pool)
            .await?;
        if let Some(row) = row {
            return Ok(WriteOutcome::Done(stored(row)));
        }
    }
}

async fn conflict(pool: &SqlitePool) -> Result<WriteOutcome, sqlx::Error> {
    let current: u32 = sqlx::query_scalar("SELECT draft_revision FROM theme WHERE id = 1")
        .fetch_one(pool)
        .await?;
    Ok(WriteOutcome::Conflict { current })
}
