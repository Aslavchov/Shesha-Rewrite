//! Demo definitions and rows for `--demo` (spec section 7). Every id is
//! fixed and readable, and every row is worked out from its number, so a
//! reset gives exactly the same data and links to rows survive it.
//!
//! The seed goes through the same checks as the API: a definition the server
//! would refuse, or a row its entity would not accept, fails loudly here.

use contracts::{EntityDefinition, ReferenceListDefinition};
use serde_json::{Value, json};
use sqlx::SqlitePool;

use super::catalog::Catalog;
use super::validate::{self, Known};
use super::{schema, validate::is_iso_date};
use crate::api::writing;
use crate::data::rows;
use crate::error::AppError;
use crate::forms::seed::PERSON_ID as PERSON_FORM_ID;

pub const PERSON_STATUS: &str = "personStatus";
pub const ORGANISATION: &str = "organisation";
pub const PERSON: &str = "person";

pub const ORGANISATION_COUNT: usize = 8;
pub const PERSON_COUNT: usize = 50;

pub fn person_status() -> Value {
    json!({
        "name": PERSON_STATUS,
        "displayName": "Person status",
        "items": [
            { "value": "active", "label": "Active", "color": "success" },
            { "value": "pending", "label": "Pending", "color": "warning" },
            { "value": "inactive", "label": "Inactive", "color": "muted" }
        ]
    })
}

pub fn organisation() -> Value {
    json!({
        "name": ORGANISATION,
        "displayName": "Organisation",
        "properties": [
            { "name": "name", "displayName": "Name", "type": "text", "required": true, "maxLength": 100 }
        ],
        "displayProperty": "name"
    })
}

pub fn person() -> Value {
    json!({
        "name": PERSON,
        "displayName": "Person",
        "properties": [
            { "name": "firstName", "displayName": "First name", "type": "text", "required": true, "maxLength": 50 },
            { "name": "surname", "displayName": "Surname", "type": "text", "required": true, "maxLength": 50 },
            { "name": "email", "displayName": "Email", "type": "text", "maxLength": 254 },
            { "name": "dateOfBirth", "displayName": "Date of birth", "type": "date" },
            { "name": "dependants", "displayName": "Dependants", "type": "number", "whole": true, "min": 0, "max": 20 },
            { "name": "status", "displayName": "Status", "type": "referenceList", "referenceList": PERSON_STATUS },
            { "name": "organisation", "displayName": "Organisation", "type": "reference", "entity": ORGANISATION },
            { "name": "notes", "displayName": "Notes", "type": "text", "multiline": true }
        ],
        "displayProperty": "surname",
        "defaultForm": PERSON_FORM_ID
    })
}

const ORGANISATIONS: [&str; ORGANISATION_COUNT] = [
    "Acacia Logistics",
    "Blue Crane Health",
    "Cape Point Media",
    "Drakensberg Tours",
    "Ekhaya Homes",
    "Fynbos Foods",
    "Golden Gate Energy",
    "Highveld Mining",
];

const FIRST_NAMES: [&str; 25] = [
    "Thandi", "Pieter", "Aisha", "Sipho", "Lerato", "Johan", "Naledi", "Imran", "Zanele", "Daniel",
    "Fatima", "Kagiso", "Elna", "Bongani", "Priya", "Andile", "Chantal", "Tebogo", "Yusuf",
    "Nomsa", "Willem", "Refilwe", "Hannah", "Mandla", "Carla",
];

/// One surname per person, all different. Three contain "smi", so the demo
/// search for it finds exactly those.
const SURNAMES: [&str; PERSON_COUNT] = [
    "Smith",
    "Naidoo",
    "Botha",
    "Dlamini",
    "Khumalo",
    "Van der Merwe",
    "Mokoena",
    "Pillay",
    "Nkosi",
    "Jacobs",
    "Smit",
    "Mahlangu",
    "Pretorius",
    "Govender",
    "Zulu",
    "Fourie",
    "Molefe",
    "Abrahams",
    "Ndlovu",
    "Venter",
    "Goldsmith",
    "Sithole",
    "Du Plessis",
    "Chetty",
    "Mthembu",
    "Coetzee",
    "Radebe",
    "Patel",
    "Mabaso",
    "Steyn",
    "Hendricks",
    "Tshabalala",
    "Viljoen",
    "Reddy",
    "Cele",
    "Marais",
    "Motaung",
    "Daniels",
    "Ngcobo",
    "Swanepoel",
    "Adams",
    "Maseko",
    "Le Roux",
    "Singh",
    "Buthelezi",
    "Erasmus",
    "Mokgosi",
    "Williams",
    "Shabalala",
    "Kruger",
];

pub fn organisation_id(number: usize) -> String {
    format!("organisation-{number}")
}

pub fn person_id(number: usize) -> String {
    format!("person-{number:02}")
}

/// The values of person `number`, from 1. Six in ten are Active, two Pending
/// and two Inactive; one in thirteen has no organisation.
pub fn person_values(number: usize) -> Value {
    let index = number - 1;
    let first_name = FIRST_NAMES[(index * 7) % FIRST_NAMES.len()];
    let surname = SURNAMES[index];
    let email = format!(
        "{}.{}@example.com",
        first_name.to_lowercase(),
        surname.to_lowercase().replace(' ', "")
    );
    let date_of_birth = format!(
        "{:04}-{:02}-{:02}",
        1958 + (index * 7) % 45,
        1 + (index * 5) % 12,
        1 + (index * 11) % 28
    );
    debug_assert!(is_iso_date(&date_of_birth));
    let status = match index % 10 {
        0..=5 => "active",
        6 | 7 => "pending",
        _ => "inactive",
    };
    let organisation = if number.is_multiple_of(13) {
        Value::Null
    } else {
        Value::String(organisation_id(1 + (index * 3) % ORGANISATION_COUNT))
    };
    let notes = match index % 6 {
        0 => Value::String(format!(
            "Prefers email.\nJoined in {}.",
            2012 + (index * 3) % 13
        )),
        3 => Value::String("Works remotely on Fridays.".to_owned()),
        _ => Value::Null,
    };
    json!({
        "firstName": first_name,
        "surname": surname,
        "email": email,
        "dateOfBirth": date_of_birth,
        "dependants": (index * 3) % 5,
        "status": status,
        "organisation": organisation,
        "notes": notes
    })
}

fn broken(what: &str, problems: &impl std::fmt::Debug) -> ! {
    panic!("the seeded {what} is invalid: {problems:?}")
}

/// Inserts the demo definitions and rows into a database that has none. The
/// demo forms must already be there: Person names its default form.
pub async fn insert(pool: &SqlitePool) -> Result<(), AppError> {
    let mut tx = writing(pool).await?;

    let list: ReferenceListDefinition = validate::reference_list(&person_status())
        .unwrap_or_else(|problems| broken("reference list", &problems));
    sqlx::query("INSERT INTO reference_lists (name, definition) VALUES (?, ?)")
        .bind(&list.name)
        .bind(person_status().to_string())
        .execute(&mut *tx)
        .await?;

    let forms: Vec<String> = sqlx::query_scalar("SELECT id FROM forms")
        .fetch_all(&mut *tx)
        .await?;
    for document in [organisation(), person()] {
        let catalog = Catalog::load(&mut tx).await?;
        let known = Known {
            entities: catalog.entities.keys().map(String::as_str).collect(),
            lists: catalog.lists.keys().map(String::as_str).collect(),
            forms: forms.iter().map(String::as_str).collect(),
        };
        let definition: EntityDefinition = validate::entity(&document, &known)
            .unwrap_or_else(|problems| broken("entity", &problems));
        schema::create(&mut tx, &definition).await?;
    }

    let catalog = Catalog::load(&mut tx).await?;
    let organisations = catalog.entity(ORGANISATION)?;
    for (index, name) in ORGANISATIONS.iter().enumerate() {
        let values = json!({ "name": name });
        let values = values.as_object().expect("an object");
        let id = organisation_id(index + 1);
        rows::create(&mut tx, &catalog, organisations, values, Some(&id)).await?;
    }
    let people = catalog.entity(PERSON)?;
    for number in 1..=PERSON_COUNT {
        let values = person_values(number);
        let values = values.as_object().expect("an object");
        rows::create(&mut tx, &catalog, people, values, Some(&person_id(number))).await?;
    }

    tx.commit().await?;
    Ok(())
}
