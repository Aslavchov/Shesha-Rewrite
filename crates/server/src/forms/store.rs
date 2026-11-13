//! Forms in the database. The document is stored as the JSON it was sent as;
//! `name` and `description` are copied out of it for listing.

use contracts::{FormDocument, FormSummary};
use serde_json::Value;
use sqlx::SqlitePool;

/// A form as stored. `document` is the JSON text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredForm {
    pub id: String,
    pub revision: u32,
    pub updated_at: String,
    pub document: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateOutcome {
    Updated(StoredForm),
    NotFound,
    /// The update was based on a revision that is no longer the current one.
    Conflict {
        current: u32,
    },
}

type FormRow = (String, u32, String, String);

fn stored((id, revision, updated_at, document): FormRow) -> StoredForm {
    StoredForm {
        id,
        revision,
        updated_at,
        document,
    }
}

/// Every form, most recently updated first.
pub async fn list(pool: &SqlitePool) -> Result<Vec<FormSummary>, sqlx::Error> {
    let rows: Vec<(String, String, String, String, u32)> = sqlx::query_as(
        "SELECT id, name, description, updated_at, revision FROM forms \
         ORDER BY updated_at DESC, rowid DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, name, description, updated_at, revision)| FormSummary {
                id,
                name,
                description,
                updated_at,
                revision,
            },
        )
        .collect())
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<StoredForm>, sqlx::Error> {
    let row: Option<FormRow> =
        sqlx::query_as("SELECT id, revision, updated_at, document FROM forms WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(stored))
}

/// Stores a new form at revision 1. `id` is for seeded forms, whose ids are
/// fixed; otherwise the database picks 16 random bytes, written as hex.
pub async fn create(
    pool: &SqlitePool,
    id: Option<&str>,
    form: &FormDocument,
    document: &Value,
) -> Result<StoredForm, sqlx::Error> {
    let row: FormRow = sqlx::query_as(
        "INSERT INTO forms (id, name, description, document) \
         VALUES (COALESCE(?, lower(hex(randomblob(16)))), ?, ?, ?) \
         RETURNING id, revision, updated_at, document",
    )
    .bind(id)
    .bind(&form.name)
    .bind(&form.description)
    .bind(document.to_string())
    .fetch_one(pool)
    .await?;
    Ok(stored(row))
}

/// Replaces the document if `based_on` is still the stored revision. The
/// check and the write are one statement, so two updates cannot both win.
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    based_on: u32,
    form: &FormDocument,
    document: &Value,
) -> Result<UpdateOutcome, sqlx::Error> {
    // `updated_at` is UTC, RFC 3339 with milliseconds, as in the migration.
    let row: Option<FormRow> = sqlx::query_as(
        "UPDATE forms SET name = ?, description = ?, document = ?, \
         revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ? AND revision = ? \
         RETURNING id, revision, updated_at, document",
    )
    .bind(&form.name)
    .bind(&form.description)
    .bind(document.to_string())
    .bind(id)
    .bind(based_on)
    .fetch_optional(pool)
    .await?;
    if let Some(row) = row {
        return Ok(UpdateOutcome::Updated(stored(row)));
    }

    let current: Option<u32> = sqlx::query_scalar("SELECT revision FROM forms WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(match current {
        Some(current) => UpdateOutcome::Conflict { current },
        None => UpdateOutcome::NotFound,
    })
}

/// Whether there was a form to delete.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM forms WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
