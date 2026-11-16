//! Demo forms for `--demo`. Their ids are fixed and readable, so links to
//! them survive a reset.

use serde_json::Value;
use sqlx::SqlitePool;

use super::{store, validate};

pub const PERSON_DETAILS_ID: &str = "person-details";
/// Phase 5: a data table of the Person entity.
pub const PEOPLE_ID: &str = "people";
/// Phase 5: the form bound to Person, and Person's default form.
pub const PERSON_ID: &str = "person";

/// The demo form covering every Phase 1 component (spec section 10).
pub fn person_details() -> Value {
    serde_json::from_str(include_str!("../../seed/person-details.json"))
        .expect("seed/person-details.json is JSON")
}

pub fn people() -> Value {
    serde_json::from_str(include_str!("../../seed/people.json")).expect("seed/people.json is JSON")
}

pub fn person() -> Value {
    serde_json::from_str(include_str!("../../seed/person.json")).expect("seed/person.json is JSON")
}

/// Inserts the demo forms into a database that has none. The one inserted
/// last is listed first.
pub async fn insert(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for (id, document) in [
        (PERSON_DETAILS_ID, person_details()),
        (PERSON_ID, person()),
        (PEOPLE_ID, people()),
    ] {
        // A test keeps the seed files valid, so this cannot fail in a build
        // that passed its tests.
        let form = validate::validate(&document)
            .unwrap_or_else(|problems| panic!("the seeded form {id} is invalid: {problems:?}"));
        store::create(pool, Some(id), &form, &document).await?;
    }
    Ok(())
}
