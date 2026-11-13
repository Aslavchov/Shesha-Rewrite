//! Demo forms for `--demo`. Their ids are fixed and readable, so links to
//! them survive a reset.

use serde_json::Value;
use sqlx::SqlitePool;

use super::{store, validate};

pub const PERSON_DETAILS_ID: &str = "person-details";

/// The demo form covering every Phase 1 component (spec section 10).
pub fn person_details() -> Value {
    serde_json::from_str(include_str!("../../seed/person-details.json"))
        .expect("seed/person-details.json is JSON")
}

/// Inserts the demo forms into a database that has none.
pub async fn insert(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let document = person_details();
    // A test keeps the seed file valid, so this cannot fail in a build that
    // passed its tests.
    let form = validate::validate(&document)
        .unwrap_or_else(|problems| panic!("the seeded demo form is invalid: {problems:?}"));
    store::create(pool, Some(PERSON_DETAILS_ID), &form, &document).await?;
    Ok(())
}
