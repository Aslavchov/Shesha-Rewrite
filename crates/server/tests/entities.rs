//! Phase 5: entity and reference list definitions (`/api/entities`,
//! `/api/reference-lists`), driven through the real router in memory.
//! The rows are tested in `data.rs`.

mod support;

use axum::http::{Method, StatusCode};
use contracts::ApiError;
use serde_json::{Value, json};
use server::entities::seed::{
    ORGANISATION, ORGANISATION_COUNT, PERSON, PERSON_COUNT, PERSON_STATUS, person_id, person_values,
};
use server::forms::seed::PERSON_ID as PERSON_FORM_ID;
use server::{AppState, db};
use support::{
    all_rows, app, create_entity, create_list, create_row, expect_refused, expect_status, get,
    message_at, no_content, paths, property, put_entity, put_entity_with_fill, put_list, query,
    refused, send, tables,
};

// Where Person's properties are in its definition.
const EMAIL: usize = 2;
const DATE_OF_BIRTH: usize = 3;
const DEPENDANTS: usize = 4;
const STATUS: usize = 5;
const ORGANISATION_PROPERTY: usize = 6;
const NOTES: usize = 7;
/// Where a property added to Person lands.
const ADDED: usize = 8;

/// The seeded values of every person, in order.
fn people() -> Vec<Value> {
    (1..=PERSON_COUNT).map(person_values).collect()
}

/// How many seeded people `holds` is true for.
fn count_people(holds: impl Fn(&Value) -> bool) -> usize {
    people().iter().filter(|person| holds(person)).count()
}

/// "1 row" or "12 rows", as the server's reasons say it.
fn rows(count: usize) -> String {
    if count == 1 {
        "1 row".to_owned()
    } else {
        format!("{count} rows")
    }
}

/// A text property with nothing special about it.
fn text(name: &str) -> Value {
    json!({ "name": name, "displayName": name, "type": "text" })
}

/// An entity named `thing` with these properties.
fn thing(properties: Value) -> Value {
    json!({ "name": "thing", "displayName": "Thing", "properties": properties })
}

/// An entity named `thing` with this one property.
fn thing_with(property: Value) -> Value {
    thing(json!([property]))
}

async fn post_entity(state: &AppState, definition: &Value) -> axum::response::Response {
    let body = json!({ "definition": definition });
    send(state, Method::POST, "/api/entities", Some(&body)).await
}

async fn invalid_entity(state: &AppState, definition: &Value) -> ApiError {
    let response = post_entity(state, definition).await;
    expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await
}

async fn invalid_list(state: &AppState, definition: &Value) -> ApiError {
    let body = json!({ "definition": definition });
    refused(
        state,
        Method::POST,
        "/api/reference-lists",
        Some(&body),
        StatusCode::BAD_REQUEST,
        "invalid_reference_list",
    )
    .await
}

/// Checks that each definition is refused with exactly the paths given, and
/// that every detail carries a sentence.
async fn assert_entity_problems(state: &AppState, cases: Vec<(&str, Value, Vec<&str>)>) {
    for (case, definition, expected) in cases {
        let error = invalid_entity(state, &definition).await;
        assert_eq!(paths(&error), expected, "{case}: {error:?}");
        for detail in error.error.details.iter().flatten() {
            assert!(detail.message.ends_with('.'), "{case}: {detail:?}");
        }
        let count = expected.len();
        let summary = if count == 1 {
            "The entity has 1 problem.".to_owned()
        } else {
            format!("The entity has {count} problems.")
        };
        assert_eq!(error.error.message, summary, "{case}");
    }
    // None of them was stored.
    let response = send(state, Method::GET, "/api/entities/thing", None).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

async fn assert_list_problems(state: &AppState, cases: Vec<(&str, Value, Vec<&str>)>) {
    for (case, definition, expected) in cases {
        let error = invalid_list(state, &definition).await;
        assert_eq!(paths(&error), expected, "{case}: {error:?}");
        for detail in error.error.details.iter().flatten() {
            assert!(detail.message.ends_with('.'), "{case}: {detail:?}");
        }
    }
}

/// A change to Person that must be refused with 409 `change_refused`.
async fn change_refused(state: &AppState, change: impl FnOnce(&mut Value)) -> ApiError {
    let response = put_entity(state, PERSON, change).await;
    expect_refused(response, StatusCode::CONFLICT, "change_refused").await
}

/// A change to Person that must be accepted. Returns the new record.
async fn change_applied(state: &AppState, change: impl FnOnce(&mut Value)) -> Value {
    let response = put_entity(state, PERSON, change).await;
    expect_status(response, StatusCode::OK).await
}

/// Person's definition and every row, to compare before and after.
async fn snapshot(state: &AppState) -> (Value, Vec<Value>) {
    (
        get(state, "/api/entities/person").await,
        all_rows(state, PERSON).await,
    )
}

fn push_property(definition: &mut Value, property: Value) {
    definition["properties"]
        .as_array_mut()
        .unwrap()
        .push(property);
}

fn remove_property(definition: &mut Value, name: &str) {
    definition["properties"]
        .as_array_mut()
        .unwrap()
        .retain(|property| property["name"] != name);
}

// --- Seeded definitions ----------------------------------------------------

// C5-1
#[tokio::test]
async fn demo_seeds_person_and_organisation_with_their_properties_and_rows() {
    let (state, _dir) = app(true).await;

    let list = get(&state, "/api/entities").await;
    let entities = list["entities"].as_array().unwrap();
    // Ordered by display name.
    let names: Vec<&Value> = entities.iter().map(|entity| &entity["name"]).collect();
    assert_eq!(names, [ORGANISATION, PERSON]);

    let organisation = &entities[0];
    assert_eq!(organisation["revision"], 1);
    assert_eq!(organisation["rows"], ORGANISATION_COUNT);
    assert_eq!(ORGANISATION_COUNT, 8);
    assert_eq!(
        organisation["definition"],
        json!({
            "name": "organisation",
            "displayName": "Organisation",
            "properties": [
                { "name": "name", "displayName": "Name", "type": "text", "required": true, "maxLength": 100 }
            ],
            "displayProperty": "name"
        })
    );

    let person = &entities[1];
    assert_eq!(person["revision"], 1);
    assert_eq!(person["rows"], PERSON_COUNT);
    assert_eq!(PERSON_COUNT, 50);
    assert_eq!(
        person["definition"],
        json!({
            "name": "person",
            "displayName": "Person",
            "properties": [
                { "name": "firstName", "displayName": "First name", "type": "text", "required": true, "maxLength": 50 },
                { "name": "surname", "displayName": "Surname", "type": "text", "required": true, "maxLength": 50 },
                { "name": "email", "displayName": "Email", "type": "text", "maxLength": 254 },
                { "name": "dateOfBirth", "displayName": "Date of birth", "type": "date" },
                { "name": "dependants", "displayName": "Dependants", "type": "number", "whole": true, "min": 0.0, "max": 20.0 },
                { "name": "status", "displayName": "Status", "type": "referenceList", "referenceList": "personStatus" },
                { "name": "organisation", "displayName": "Organisation", "type": "reference", "entity": "organisation" },
                { "name": "notes", "displayName": "Notes", "type": "text", "multiline": true }
            ],
            "displayProperty": "surname",
            "defaultForm": "person"
        })
    );
    assert_eq!(PERSON_FORM_ID, "person");

    // One entity reads the same as its entry in the list, and its default
    // form is a form that exists.
    assert_eq!(&get(&state, "/api/entities/person").await, person);
    get(&state, "/api/forms/person").await;
    let updated_at = person["updatedAt"].as_str().unwrap();
    assert!(updated_at.ends_with('Z') && updated_at.len() == 24);
}

// C5-1
#[tokio::test]
async fn demo_seeds_the_person_status_list_with_its_items_and_colours() {
    let (state, _dir) = app(true).await;

    let lists = get(&state, "/api/reference-lists").await;
    let lists = lists["referenceLists"].as_array().unwrap();
    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0]["name"], PERSON_STATUS);
    assert_eq!(lists[0]["revision"], 1);
    assert_eq!(
        lists[0]["definition"],
        json!({
            "name": "personStatus",
            "displayName": "Person status",
            "items": [
                { "value": "active", "label": "Active", "color": "success" },
                { "value": "pending", "label": "Pending", "color": "warning" },
                { "value": "inactive", "label": "Inactive", "color": "muted" }
            ]
        })
    );
    assert_eq!(
        &get(&state, "/api/reference-lists/personStatus").await,
        &lists[0]
    );
}

// C5-1
#[tokio::test]
async fn a_database_without_demo_has_no_entities_or_reference_lists() {
    let (state, _dir) = app(false).await;

    assert_eq!(
        get(&state, "/api/entities").await,
        json!({ "entities": [] })
    );
    assert_eq!(
        get(&state, "/api/reference-lists").await,
        json!({ "referenceLists": [] })
    );
    refused(
        &state,
        Method::GET,
        "/api/entities/person",
        None,
        StatusCode::NOT_FOUND,
        "entity_not_found",
    )
    .await;
    refused(
        &state,
        Method::POST,
        "/api/data/person/query",
        Some(&json!({})),
        StatusCode::NOT_FOUND,
        "entity_not_found",
    )
    .await;
}

// --- A new entity ----------------------------------------------------------

async fn create_vehicle(state: &AppState) {
    let fuel = create_list(
        state,
        json!({
            "name": "fuel",
            "displayName": "Fuel",
            "items": [
                { "value": "petrol", "label": "Petrol" },
                { "value": "diesel", "label": "Diesel" },
                { "value": "electric", "label": "Electric" }
            ]
        }),
    )
    .await;
    assert_eq!(fuel["name"], "fuel");
    assert_eq!(fuel["revision"], 1);
    // An item with no colour gets the quiet one.
    assert_eq!(fuel["definition"]["items"][0]["color"], "muted");

    let vehicle = create_entity(
        state,
        json!({
            "name": "vehicle",
            "displayName": "Vehicle",
            "properties": [
                { "name": "registration", "displayName": "Registration", "type": "text", "required": true, "maxLength": 10 },
                { "name": "year", "displayName": "Year", "type": "number", "whole": true, "min": 1900, "max": 2100 },
                { "name": "fuel", "displayName": "Fuel", "type": "referenceList", "referenceList": "fuel" }
            ],
            "displayProperty": "registration"
        }),
    )
    .await;
    assert_eq!(vehicle["name"], "vehicle");
    assert_eq!(vehicle["revision"], 1);
    assert_eq!(vehicle["rows"], 0);
}

// C5-2
#[tokio::test]
async fn a_new_entity_stores_a_valid_row_at_once() {
    let (state, _dir) = app(false).await;
    create_vehicle(&state).await;

    let created = create_row(
        &state,
        "vehicle",
        json!({ "registration": "CA 123-456", "year": 2020, "fuel": "diesel" }),
    )
    .await;

    assert_eq!(created["revision"], 1);
    assert_eq!(created["display"], "CA 123-456");
    let values = json!({ "registration": "CA 123-456", "year": 2020, "fuel": "diesel" });
    assert_eq!(created["values"], values);

    let id = created["id"].as_str().unwrap();
    let read = get(&state, &format!("/api/data/vehicle/{id}")).await;
    assert_eq!(read, created);
    let page = query(&state, "vehicle", json!({})).await;
    assert_eq!(page["total"], 1);
    assert_eq!(page["rows"][0], created);
    assert_eq!(get(&state, "/api/entities/vehicle").await["rows"], 1);
}

// C5-2
#[tokio::test]
async fn a_new_entity_refuses_an_invalid_row_with_a_detail_per_bad_property() {
    let (state, _dir) = app(false).await;
    create_vehicle(&state).await;

    let cases = [
        json!({ "year": 1800, "fuel": "coal" }),
        json!({ "registration": "CA 123-456-789", "year": 2020.5, "fuel": "coal" }),
    ];
    for values in cases {
        let error = refused(
            &state,
            Method::POST,
            "/api/data/vehicle",
            Some(&json!({ "values": values })),
            StatusCode::BAD_REQUEST,
            "invalid_row",
        )
        .await;
        assert_eq!(
            paths(&error),
            ["registration", "year", "fuel"],
            "{values}: {error:?}"
        );
        assert_eq!(error.error.message, "The row has 3 problems.");
    }

    let error = refused(
        &state,
        Method::POST,
        "/api/data/vehicle",
        Some(&json!({ "values": { "year": 1800, "fuel": "coal" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(message_at(&error, "registration"), "This field is required");
    assert_eq!(
        message_at(&error, "year"),
        "Enter a number that is 1900 or more"
    );
    assert_eq!(message_at(&error, "fuel"), "Fuel has no item \"coal\"");

    // Nothing was stored.
    assert_eq!(query(&state, "vehicle", json!({})).await["total"], 0);
    assert_eq!(get(&state, "/api/entities/vehicle").await["rows"], 0);
}

// --- Definition validation -------------------------------------------------

#[tokio::test]
async fn entity_and_property_names_must_be_plain_identifiers() {
    let (state, _dir) = app(true).await;
    let named = |name: &str| json!({ "name": name, "displayName": "Thing", "properties": [] });
    let long = "x".repeat(65);

    let mut cases = vec![
        ("empty entity name", named(""), vec!["name"]),
        ("starts with a digit", named("1st"), vec!["name"]),
        ("has a space", named("first name"), vec!["name"]),
        ("has a hyphen", named("first-name"), vec!["name"]),
        ("starts with _", named("_thing"), vec!["name"]),
        ("not ASCII", named("naïve"), vec!["name"]),
        ("65 characters", named(&long), vec!["name"]),
        (
            "bad property name",
            thing_with(text("first name")),
            vec!["properties[0].name"],
        ),
        (
            "empty property name",
            thing_with(json!({ "name": "", "displayName": "Nameless", "type": "text" })),
            vec!["properties[0].name"],
        ),
        (
            "property name of 65 characters",
            thing_with(text(&long)),
            vec!["properties[0].name"],
        ),
        (
            "the same name twice",
            thing(json!([text("email"), text("other"), text("email")])),
            vec!["properties[2].name"],
        ),
        (
            "the same name in another case",
            thing(json!([text("email"), text("Email")])),
            vec!["properties[1].name"],
        ),
    ];
    for system in ["id", "createdAt", "updatedAt", "revision"] {
        cases.push((
            "a system property's name",
            thing(json!([text("ok"), text(system)])),
            vec!["properties[1].name"],
        ));
    }
    assert_entity_problems(&state, cases).await;

    let error = invalid_entity(&state, &named("first name")).await;
    assert_eq!(
        message_at(&error, "name"),
        "\"first name\" is not a valid name for an entity. Use letters, digits and _, starting with a letter, at most 64 characters."
    );
    let error = invalid_entity(&state, &thing(json!([text("email"), text("Email")]))).await;
    assert_eq!(
        message_at(&error, "properties[1].name"),
        "\"Email\" is already the name of properties[0]."
    );
    let error = invalid_entity(&state, &thing_with(text("revision"))).await;
    assert_eq!(
        message_at(&error, "properties[0].name"),
        "Every row already has \"revision\"; choose another name."
    );

    // The longest name allowed is fine.
    create_entity(&state, named(&"x".repeat(64))).await;
}

#[tokio::test]
async fn display_names_and_help_text_are_needed_and_limited() {
    let (state, _dir) = app(true).await;
    let property =
        |display_name: &str| json!({ "name": "a", "displayName": display_name, "type": "text" });

    assert_entity_problems(
        &state,
        vec![
            (
                "no entity display name",
                json!({ "name": "thing", "displayName": "", "properties": [] }),
                vec!["displayName"],
            ),
            (
                "blank entity display name",
                json!({ "name": "thing", "displayName": "  \t ", "properties": [] }),
                vec!["displayName"],
            ),
            (
                "entity display name of 201 characters",
                json!({ "name": "thing", "displayName": "é".repeat(201), "properties": [] }),
                vec!["displayName"],
            ),
            (
                "blank property display name",
                thing_with(property("   ")),
                vec!["properties[0].displayName"],
            ),
            (
                "property display name of 201 characters",
                thing_with(property(&"n".repeat(201))),
                vec!["properties[0].displayName"],
            ),
            (
                "help text of 1001 characters",
                thing_with(json!({
                    "name": "a", "displayName": "A", "type": "text", "helpText": "h".repeat(1001)
                })),
                vec!["properties[0].helpText"],
            ),
        ],
    )
    .await;

    // Lengths are counted in characters: 200 two-byte characters fit.
    let created = create_entity(
        &state,
        json!({
            "name": "thing",
            "displayName": "é".repeat(200),
            "properties": [{
                "name": "a", "displayName": "A", "type": "text", "helpText": "é".repeat(1000)
            }]
        }),
    )
    .await;
    assert_eq!(
        created["definition"]["properties"][0]["helpText"],
        "é".repeat(1000)
    );
}

#[tokio::test]
async fn a_limit_must_belong_to_its_propertys_type() {
    let (state, _dir) = app(true).await;
    let with = |kind: &str, key: &str, value: Value| {
        let mut property = json!({ "name": "a", "displayName": "A", "type": kind });
        property[key] = value;
        thing_with(property)
    };

    assert_entity_problems(
        &state,
        vec![
            (
                "maxLength on a number",
                with("number", "maxLength", json!(10)),
                vec!["properties[0].maxLength"],
            ),
            (
                "multiline on a date",
                with("date", "multiline", json!(true)),
                vec!["properties[0].multiline"],
            ),
            (
                "whole on text",
                with("text", "whole", json!(true)),
                vec!["properties[0].whole"],
            ),
            (
                "min on text",
                with("text", "min", json!(1)),
                vec!["properties[0].min"],
            ),
            (
                "max on a yes/no",
                with("boolean", "max", json!(1)),
                vec!["properties[0].max"],
            ),
            (
                "earliest on text",
                with("text", "earliest", json!("2020-01-01")),
                vec!["properties[0].earliest"],
            ),
            (
                "latest on a number",
                with("number", "latest", json!("2020-01-01")),
                vec!["properties[0].latest"],
            ),
            (
                "referenceList on text",
                with("text", "referenceList", json!(PERSON_STATUS)),
                vec!["properties[0].referenceList"],
            ),
            (
                "entity on text",
                with("text", "entity", json!(ORGANISATION)),
                vec!["properties[0].entity"],
            ),
        ],
    )
    .await;

    let error = invalid_entity(&state, &with("number", "maxLength", json!(10))).await;
    assert_eq!(
        message_at(&error, "properties[0].maxLength"),
        "maxLength is a limit of text properties; this one is a number property."
    );
}

#[tokio::test]
async fn text_number_and_date_limits_must_make_sense() {
    let (state, _dir) = app(true).await;
    let property = |kind: &str, limits: Value| {
        let mut property = json!({ "name": "a", "displayName": "A", "type": kind });
        for (key, value) in limits.as_object().unwrap() {
            property[key] = value.clone();
        }
        thing_with(property)
    };

    assert_entity_problems(
        &state,
        vec![
            (
                "maxLength 0",
                property("text", json!({ "maxLength": 0 })),
                vec!["properties[0].maxLength"],
            ),
            (
                "maxLength over the longest text",
                property("text", json!({ "maxLength": 100_001 })),
                vec!["properties[0].maxLength"],
            ),
            (
                "min above max",
                property("number", json!({ "min": 5, "max": 4 })),
                vec!["properties[0].min"],
            ),
            (
                "a fraction as the minimum of a whole number",
                property("number", json!({ "whole": true, "min": 1.5 })),
                vec!["properties[0].min"],
            ),
            (
                "a fraction as the maximum of a whole number",
                property("number", json!({ "whole": true, "max": 2.5 })),
                vec!["properties[0].max"],
            ),
            (
                "a minimum too large to be exact",
                property("number", json!({ "min": 1e16 })),
                vec!["properties[0].min"],
            ),
            (
                "a maximum too large to be exact",
                property("number", json!({ "max": -1e16 })),
                vec!["properties[0].max"],
            ),
            (
                "an earliest day that does not exist",
                property("date", json!({ "earliest": "2023-02-29" })),
                vec!["properties[0].earliest"],
            ),
            (
                "a latest day that is not a date",
                property("date", json!({ "latest": "tomorrow" })),
                vec!["properties[0].latest"],
            ),
            (
                "a date with a time",
                property("date", json!({ "latest": "2024-01-01T00:00:00Z" })),
                vec!["properties[0].latest"],
            ),
            (
                "earliest after latest",
                property(
                    "date",
                    json!({ "earliest": "2024-06-02", "latest": "2024-06-01" }),
                ),
                vec!["properties[0].earliest"],
            ),
        ],
    )
    .await;

    let error = invalid_entity(&state, &property("number", json!({ "min": 5, "max": 4 }))).await;
    assert_eq!(
        message_at(&error, "properties[0].min"),
        "The minimum cannot be above the maximum."
    );
    let error = invalid_entity(
        &state,
        &property("date", json!({ "earliest": "2023-02-29" })),
    )
    .await;
    assert_eq!(
        message_at(&error, "properties[0].earliest"),
        "\"2023-02-29\" is not a date. Write it as YYYY-MM-DD."
    );

    // Limits that are equal, at the edges, and decimal limits on a decimal
    // number are all fine.
    create_entity(
        &state,
        thing(json!([
            { "name": "a", "displayName": "A", "type": "text", "maxLength": 100_000 },
            { "name": "b", "displayName": "B", "type": "text", "maxLength": 1 },
            { "name": "c", "displayName": "C", "type": "number", "min": 1.5, "max": 1.5 },
            { "name": "d", "displayName": "D", "type": "number", "whole": true, "min": -3, "max": 3 },
            { "name": "e", "displayName": "E", "type": "date", "earliest": "2024-02-29", "latest": "2024-02-29" }
        ])),
    )
    .await;
}

#[tokio::test]
async fn what_a_definition_names_must_exist() {
    let (state, _dir) = app(true).await;
    let property = |kind: &str, key: &str, value: &str| {
        let mut property = json!({ "name": "a", "displayName": "A", "type": kind });
        property[key] = json!(value);
        thing_with(property)
    };

    assert_entity_problems(
        &state,
        vec![
            (
                "a reference list property without a list",
                thing_with(json!({ "name": "a", "displayName": "A", "type": "referenceList" })),
                vec!["properties[0].referenceList"],
            ),
            (
                "an unknown list",
                property("referenceList", "referenceList", "colours"),
                vec!["properties[0].referenceList"],
            ),
            (
                "an entity's name where a list's is needed",
                property("referenceList", "referenceList", ORGANISATION),
                vec!["properties[0].referenceList"],
            ),
            (
                "a reference without an entity",
                thing_with(json!({ "name": "a", "displayName": "A", "type": "reference" })),
                vec!["properties[0].entity"],
            ),
            (
                "an unknown entity",
                property("reference", "entity", "planet"),
                vec!["properties[0].entity"],
            ),
            (
                "a display property that is not there",
                json!({
                    "name": "thing", "displayName": "Thing",
                    "properties": [text("title")], "displayProperty": "name"
                }),
                vec!["displayProperty"],
            ),
            (
                "a display property that is not text",
                json!({
                    "name": "thing", "displayName": "Thing",
                    "properties": [{ "name": "born", "displayName": "Born", "type": "date" }],
                    "displayProperty": "born"
                }),
                vec!["displayProperty"],
            ),
            (
                "an unknown default form",
                json!({
                    "name": "thing", "displayName": "Thing",
                    "properties": [], "defaultForm": "no-such-form"
                }),
                vec!["defaultForm"],
            ),
            (
                "a required yes/no",
                thing_with(json!({
                    "name": "a", "displayName": "A", "type": "boolean", "required": true
                })),
                vec!["properties[0].required"],
            ),
        ],
    )
    .await;

    let error = invalid_entity(&state, &property("reference", "entity", "planet")).await;
    assert_eq!(
        message_at(&error, "properties[0].entity"),
        "There is no entity named planet."
    );
    let error = invalid_entity(
        &state,
        &json!({
            "name": "thing", "displayName": "Thing",
            "properties": [{ "name": "born", "displayName": "Born", "type": "date" }],
            "displayProperty": "born"
        }),
    )
    .await;
    assert_eq!(
        message_at(&error, "displayProperty"),
        "Born is a date property; rows are shown by a text property."
    );
}

#[tokio::test]
async fn an_entity_may_refer_to_itself() {
    let (state, _dir) = app(false).await;

    let created = create_entity(
        &state,
        json!({
            "name": "employee",
            "displayName": "Employee",
            "properties": [
                text("name"),
                { "name": "manager", "displayName": "Manager", "type": "reference", "entity": "employee" }
            ],
            "displayProperty": "name"
        }),
    )
    .await;
    assert_eq!(created["definition"]["properties"][1]["entity"], "employee");

    let boss = create_row(&state, "employee", json!({ "name": "Boss" })).await;
    let report = create_row(
        &state,
        "employee",
        json!({ "name": "Report", "manager": boss["id"] }),
    )
    .await;
    assert_eq!(report["references"], json!({ "manager": "Boss" }));
}

#[tokio::test]
async fn a_definition_of_the_wrong_shape_is_refused_with_the_place() {
    let (state, _dir) = app(true).await;

    let mut unknown_key = thing(json!([]));
    unknown_key["colour"] = json!("red");
    let mut unknown_property_key = text("a");
    unknown_property_key["maxlength"] = json!(5);

    let cases = vec![
        ("not an object", json!("thing"), ""),
        ("a list", json!([]), ""),
        (
            "no name",
            json!({ "displayName": "Thing", "properties": [] }),
            "",
        ),
        (
            "no properties",
            json!({ "name": "thing", "displayName": "Thing" }),
            "",
        ),
        (
            "properties that are not a list",
            json!({ "name": "thing", "displayName": "Thing", "properties": {} }),
            "properties",
        ),
        (
            "a name that is not text",
            json!({ "name": 5, "displayName": "Thing", "properties": [] }),
            "name",
        ),
        (
            "an unknown type",
            thing_with(json!({ "name": "a", "displayName": "A", "type": "money" })),
            "properties[0].type",
        ),
        (
            "a property with no type",
            thing_with(json!({ "name": "a", "displayName": "A" })),
            "properties[0]",
        ),
        (
            "a negative maxLength",
            thing_with(json!({ "name": "a", "displayName": "A", "type": "text", "maxLength": -1 })),
            "properties[0].maxLength",
        ),
        (
            "required that is not true or false",
            thing_with(
                json!({ "name": "a", "displayName": "A", "type": "text", "required": "yes" }),
            ),
            "properties[0].required",
        ),
    ];
    for (case, definition, path) in cases {
        let error = invalid_entity(&state, &definition).await;
        assert_eq!(paths(&error), [path], "{case}: {error:?}");
    }

    // An unknown key is named, wherever it is.
    for (definition, path, key) in [
        (unknown_key, "colour", "`colour`"),
        (
            thing_with(unknown_property_key),
            "properties[0].maxlength",
            "`maxlength`",
        ),
    ] {
        let error = invalid_entity(&state, &definition).await;
        assert_eq!(paths(&error), [path]);
        let message = message_at(&error, path);
        assert!(
            message.starts_with(&format!("Unknown field {key}, expected one of")),
            "{message}"
        );
    }

    // Without a definition at all, the request itself is wrong.
    for body in [json!({}), json!({ "document": thing(json!([])) })] {
        refused(
            &state,
            Method::POST,
            "/api/entities",
            Some(&body),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
    }
    refused(
        &state,
        Method::POST,
        "/api/entities",
        Some(&json!([1, 2])),
        StatusCode::BAD_REQUEST,
        "invalid_request",
    )
    .await;
    assert_eq!(
        get(&state, "/api/entities").await["entities"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[tokio::test]
async fn an_entity_has_at_most_200_properties() {
    let (state, _dir) = app(false).await;
    let properties = |count: usize| -> Value {
        (0..count)
            .map(|index| text(&format!("p{index}")))
            .collect::<Vec<_>>()
            .into()
    };

    let error = invalid_entity(&state, &thing(properties(201))).await;
    assert_eq!(paths(&error), ["properties"]);
    assert_eq!(
        message_at(&error, "properties"),
        "An entity has at most 200 properties; this one has 201."
    );

    // 200 are stored, and a row can use the last of them.
    create_entity(&state, thing(properties(200))).await;
    let row = create_row(&state, "thing", json!({ "p199": "last" })).await;
    assert_eq!(row["values"]["p199"], "last");
    assert_eq!(row["values"].as_object().unwrap().len(), 200);
}

#[tokio::test]
async fn every_problem_of_a_definition_is_listed_at_once() {
    let (state, _dir) = app(true).await;

    let error = invalid_entity(
        &state,
        &json!({
            "name": "my thing",
            "displayName": " ",
            "properties": [
                { "name": "id", "displayName": "", "type": "text", "maxLength": 0 },
                { "name": "amount", "displayName": "Amount", "type": "number", "min": 2, "max": 1, "multiline": true },
                { "name": "Amount", "displayName": "Again", "type": "reference", "entity": "planet" },
                { "name": "when", "displayName": "When", "type": "date", "earliest": "soon" },
                { "name": "state", "displayName": "State", "type": "referenceList", "referenceList": "nope" }
            ],
            "displayProperty": "amount",
            "defaultForm": "missing"
        }),
    )
    .await;

    assert_eq!(
        paths(&error),
        [
            "name",
            "displayName",
            "properties[0].name",
            "properties[0].displayName",
            "properties[0].maxLength",
            "properties[1].multiline",
            "properties[1].min",
            "properties[2].entity",
            "properties[2].name",
            "properties[3].earliest",
            "properties[4].referenceList",
            "displayProperty",
            "defaultForm"
        ]
    );
    assert_eq!(error.error.message, "The entity has 13 problems.");
}

#[tokio::test]
async fn sql_like_names_are_refused_and_reach_no_table() {
    let (state, _dir) = app(true).await;
    let before = tables(&state).await;
    let attacks = [
        "x; DROP TABLE forms",
        "x\"; DROP TABLE forms; --",
        "forms",
        "entity_1; DELETE FROM entity_1",
        "x' OR '1'='1",
    ];

    for attack in attacks {
        if attack != "forms" {
            let error = invalid_entity(
                &state,
                &json!({ "name": attack, "displayName": "X", "properties": [] }),
            )
            .await;
            assert_eq!(paths(&error), ["name"], "{attack}");
            let error = invalid_entity(&state, &thing_with(text(attack))).await;
            assert_eq!(paths(&error), ["properties[0].name"], "{attack}");
            let error = invalid_list(
                &state,
                &json!({ "name": attack, "displayName": "X", "items": [] }),
            )
            .await;
            assert_eq!(paths(&error), ["name"], "{attack}");
            let error = invalid_list(
                &state,
                &json!({
                    "name": "x", "displayName": "X",
                    "items": [{ "value": attack, "label": "X" }]
                }),
            )
            .await;
            assert_eq!(paths(&error), ["items[0].value"], "{attack}");
        }

        // As the name in an address it is just a name nothing has.
        let encoded = attack.replace(' ', "%20").replace('"', "%22");
        for method in [Method::GET, Method::DELETE] {
            refused(
                &state,
                method,
                &format!("/api/entities/{encoded}"),
                None,
                StatusCode::NOT_FOUND,
                "entity_not_found",
            )
            .await;
        }
        refused(
            &state,
            Method::POST,
            &format!("/api/data/{encoded}/query"),
            Some(&json!({})),
            StatusCode::NOT_FOUND,
            "entity_not_found",
        )
        .await;
    }

    // An entity may be called what a table of the server's own is called:
    // its table has a generated name.
    create_entity(
        &state,
        json!({ "name": "forms", "displayName": "Forms", "properties": [text("select")] }),
    )
    .await;
    create_row(&state, "forms", json!({ "select": "drop" })).await;

    let after = tables(&state).await;
    assert_eq!(after.len(), before.len() + 1);
    assert!(after.contains(&"forms".to_owned()));
    assert_eq!(
        get(&state, "/api/forms").await["forms"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(all_rows(&state, PERSON).await.len(), PERSON_COUNT);
}

#[tokio::test]
async fn reference_list_definitions_are_checked() {
    let (state, _dir) = app(false).await;
    let list =
        |items: Value| json!({ "name": "colours", "displayName": "Colours", "items": items });
    let item = |value: &str, label: &str| json!({ "value": value, "label": label });
    let many: Vec<Value> = (0..201)
        .map(|index| item(&format!("v{index}"), "Label"))
        .collect();

    assert_list_problems(
        &state,
        vec![
            (
                "a bad name",
                json!({ "name": "my list", "displayName": "X", "items": [] }),
                vec!["name"],
            ),
            (
                "a name of 65 characters",
                json!({ "name": "x".repeat(65), "displayName": "X", "items": [] }),
                vec!["name"],
            ),
            (
                "a blank display name",
                json!({ "name": "colours", "displayName": " ", "items": [] }),
                vec!["displayName"],
            ),
            (
                "a display name of 201 characters",
                json!({ "name": "colours", "displayName": "x".repeat(201), "items": [] }),
                vec!["displayName"],
            ),
            (
                "a value with a space",
                list(json!([item("dark red", "Dark red")])),
                vec!["items[0].value"],
            ),
            (
                "a value that starts with a digit",
                list(json!([item("red", "Red"), item("1st", "First")])),
                vec!["items[1].value"],
            ),
            (
                "an empty value",
                list(json!([item("", "Nothing")])),
                vec!["items[0].value"],
            ),
            (
                "a value of 65 characters",
                list(json!([item(&"v".repeat(65), "Long")])),
                vec!["items[0].value"],
            ),
            (
                "the same value twice",
                list(json!([
                    item("red", "Red"),
                    item("blue", "Blue"),
                    item("red", "Rouge")
                ])),
                vec!["items[2].value"],
            ),
            (
                "a blank label",
                list(json!([item("red", "  ")])),
                vec!["items[0].label"],
            ),
            (
                "a label of 201 characters",
                list(json!([item("red", &"r".repeat(201))])),
                vec!["items[0].label"],
            ),
            (
                "an unknown colour",
                list(json!([{ "value": "red", "label": "Red", "color": "red" }])),
                vec!["items[0].color"],
            ),
            ("201 items", list(many.into()), vec!["items"]),
            ("not an object", json!(["colours"]), vec![""]),
            (
                "items that are not a list",
                json!({ "name": "colours", "displayName": "Colours", "items": "red" }),
                vec!["items"],
            ),
            (
                "several at once",
                json!({
                    "name": "2 colours",
                    "displayName": "",
                    "items": [item("red", ""), item("red", "Red"), item("a b", "AB")]
                }),
                vec![
                    "name",
                    "displayName",
                    "items[0].label",
                    "items[1].value",
                    "items[2].value",
                ],
            ),
        ],
    )
    .await;

    let error = invalid_list(
        &state,
        &list(json!([item("red", "Red"), item("red", "Rouge")])),
    )
    .await;
    assert_eq!(
        message_at(&error, "items[1].value"),
        "\"red\" is already the value of items[0]."
    );
    assert_eq!(error.error.message, "The reference list has 1 problem.");

    // An unknown key is named.
    let error = invalid_list(
        &state,
        &json!({ "name": "colours", "displayName": "Colours", "items": [], "order": 1 }),
    )
    .await;
    assert_eq!(paths(&error), ["order"]);
    assert!(message_at(&error, "order").starts_with("Unknown field `order`"));

    // Nothing was stored; a sound list is, with `-` and `_` in a value and
    // every colour there is.
    assert_eq!(
        get(&state, "/api/reference-lists").await,
        json!({ "referenceLists": [] })
    );
    let colours: Vec<Value> = contracts::ITEM_COLORS
        .iter()
        .map(|color| json!({ "value": format!("is-{color}_1"), "label": color, "color": color }))
        .collect();
    let created = create_list(&state, list(colours.clone().into())).await;
    assert_eq!(created["definition"]["items"], Value::from(colours));

    refused(
        &state,
        Method::POST,
        "/api/reference-lists",
        Some(&json!({})),
        StatusCode::BAD_REQUEST,
        "invalid_request",
    )
    .await;
}

// --- Names, revisions and what is not there ----------------------------------

#[tokio::test]
async fn a_name_that_is_taken_cannot_be_used_again_whatever_its_case() {
    let (state, _dir) = app(true).await;

    for name in ["person", "Person", "PERSON"] {
        let body =
            json!({ "definition": { "name": name, "displayName": "Another", "properties": [] } });
        let error = refused(
            &state,
            Method::POST,
            "/api/entities",
            Some(&body),
            StatusCode::CONFLICT,
            "name_taken",
        )
        .await;
        assert_eq!(
            error.error.message,
            format!("There is already an entity named {name}. Choose another name.")
        );
        assert!(error.error.details.is_none());
    }
    for name in ["personStatus", "personstatus"] {
        let body = json!({ "definition": { "name": name, "displayName": "Another", "items": [] } });
        let error = refused(
            &state,
            Method::POST,
            "/api/reference-lists",
            Some(&body),
            StatusCode::CONFLICT,
            "name_taken",
        )
        .await;
        assert_eq!(
            error.error.message,
            format!("There is already a reference list named {name}. Choose another name.")
        );
    }

    // Nothing was added or replaced.
    let entities = get(&state, "/api/entities").await;
    assert_eq!(entities["entities"].as_array().unwrap().len(), 2);
    assert_eq!(
        entities["entities"][1]["definition"]["displayName"],
        "Person"
    );
    assert_eq!(entities["entities"][1]["rows"], PERSON_COUNT);
    let lists = get(&state, "/api/reference-lists").await;
    assert_eq!(lists["referenceLists"].as_array().unwrap().len(), 1);

    // An entity and a list may share a name: they are different things.
    create_list(
        &state,
        json!({ "name": "person", "displayName": "Person kinds", "items": [] }),
    )
    .await;
}

#[tokio::test]
async fn a_saved_name_cannot_be_changed() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;

    for name in ["human", "Person"] {
        let response = put_entity(&state, PERSON, |definition| {
            definition["name"] = json!(name);
        })
        .await;
        let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
        assert_eq!(paths(&error), ["name"]);
        assert_eq!(
            message_at(&error, "name"),
            "An entity's name is fixed once it is saved: this one is person."
        );
    }
    assert_eq!(snapshot(&state).await, before);
    refused(
        &state,
        Method::GET,
        "/api/entities/human",
        None,
        StatusCode::NOT_FOUND,
        "entity_not_found",
    )
    .await;

    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["name"] = json!("state");
    })
    .await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_reference_list").await;
    assert_eq!(paths(&error), ["name"]);
    assert_eq!(
        get(&state, "/api/reference-lists/personStatus").await["revision"],
        1
    );

    // The display name can always change.
    let updated = change_applied(&state, |definition| {
        definition["displayName"] = json!("Human");
    })
    .await;
    assert_eq!(updated["name"], "person");
    assert_eq!(updated["revision"], 2);
    assert_eq!(updated["definition"]["displayName"], "Human");
    assert_eq!(updated["rows"], PERSON_COUNT);
}

#[tokio::test]
async fn a_stale_revision_changes_nothing() {
    let (state, _dir) = app(true).await;
    let first = get(&state, "/api/entities/person").await;
    let mut definition = first["definition"].clone();
    definition["displayName"] = json!("First");
    let second = support::ok(
        &state,
        Method::PUT,
        "/api/entities/person",
        Some(&json!({ "revision": 1, "definition": definition })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(second["revision"], 2);
    let before = snapshot(&state).await;

    // Based on revision 1 again, and on one that never was.
    definition["displayName"] = json!("Second");
    remove_property(&mut definition, "notes");
    for revision in [1, 3, 0] {
        let error = refused(
            &state,
            Method::PUT,
            "/api/entities/person",
            Some(&json!({ "revision": revision, "definition": definition })),
            StatusCode::CONFLICT,
            "revision_conflict",
        )
        .await;
        assert_eq!(
            error.error.message,
            format!(
                "The entity has changed since revision {revision}: it is now at revision 2. Load it again and reapply the change."
            )
        );
    }
    assert_eq!(snapshot(&state).await, before);
    assert_eq!(before.0["definition"]["displayName"], "First");

    // The same for a reference list.
    let list = get(&state, "/api/reference-lists/personStatus").await;
    let mut definition = list["definition"].clone();
    definition["displayName"] = json!("State");
    let body = json!({ "revision": 1, "definition": definition });
    support::ok(
        &state,
        Method::PUT,
        "/api/reference-lists/personStatus",
        Some(&body),
        StatusCode::OK,
    )
    .await;
    definition["displayName"] = json!("Again");
    let error = refused(
        &state,
        Method::PUT,
        "/api/reference-lists/personStatus",
        Some(&json!({ "revision": 1, "definition": definition })),
        StatusCode::CONFLICT,
        "revision_conflict",
    )
    .await;
    assert!(error.error.message.contains("it is now at revision 2"));
    let stored = get(&state, "/api/reference-lists/personStatus").await;
    assert_eq!(stored["revision"], 2);
    assert_eq!(stored["definition"]["displayName"], "State");
}

#[tokio::test]
async fn a_change_must_say_which_revision_it_was_based_on() {
    let (state, _dir) = app(true).await;
    let entity = get(&state, "/api/entities/person").await;
    let list = get(&state, "/api/reference-lists/personStatus").await;

    for revision in [
        None,
        Some(json!("1")),
        Some(json!(-1)),
        Some(json!(1.5)),
        Some(Value::Null),
    ] {
        for (uri, definition) in [
            ("/api/entities/person", &entity["definition"]),
            ("/api/reference-lists/personStatus", &list["definition"]),
        ] {
            let mut body = json!({ "definition": definition });
            if let Some(revision) = &revision {
                body["revision"] = revision.clone();
            }
            let error = refused(
                &state,
                Method::PUT,
                uri,
                Some(&body),
                StatusCode::BAD_REQUEST,
                "invalid_request",
            )
            .await;
            assert!(error.error.message.contains("\"revision\""), "{error:?}");
        }
    }

    // And what it changes to.
    for uri in ["/api/entities/person", "/api/reference-lists/personStatus"] {
        let error = refused(
            &state,
            Method::PUT,
            uri,
            Some(&json!({ "revision": 1 })),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
        assert!(error.error.message.contains("\"definition\""), "{error:?}");
    }
    // `fill` is an object when it is there at all.
    let error = refused(
        &state,
        Method::PUT,
        "/api/entities/person",
        Some(&json!({ "revision": 1, "definition": entity["definition"], "fill": ["x"] })),
        StatusCode::BAD_REQUEST,
        "invalid_request",
    )
    .await;
    assert!(error.error.message.contains("\"fill\""), "{error:?}");

    assert_eq!(get(&state, "/api/entities/person").await, entity);
    assert_eq!(get(&state, "/api/reference-lists/personStatus").await, list);
}

#[tokio::test]
async fn an_unknown_entity_or_list_is_a_404() {
    let (state, _dir) = app(true).await;
    let entity = json!({
        "revision": 1,
        "definition": { "name": "planet", "displayName": "Planet", "properties": [] }
    });
    let list = json!({
        "revision": 1,
        "definition": { "name": "moons", "displayName": "Moons", "items": [] }
    });

    for (method, body) in [
        (Method::GET, None),
        (Method::PUT, Some(&entity)),
        (Method::DELETE, None),
    ] {
        let error = refused(
            &state,
            method,
            "/api/entities/planet",
            body,
            StatusCode::NOT_FOUND,
            "entity_not_found",
        )
        .await;
        assert_eq!(error.error.message, "There is no entity named planet.");
    }
    for (method, body) in [
        (Method::GET, None),
        (Method::PUT, Some(&list)),
        (Method::DELETE, None),
    ] {
        let error = refused(
            &state,
            method,
            "/api/reference-lists/moons",
            body,
            StatusCode::NOT_FOUND,
            "reference_list_not_found",
        )
        .await;
        assert_eq!(
            error.error.message,
            "There is no reference list named moons."
        );
    }
    // A list is not an entity, and the other way round.
    refused(
        &state,
        Method::GET,
        "/api/entities/personStatus",
        None,
        StatusCode::NOT_FOUND,
        "entity_not_found",
    )
    .await;
    refused(
        &state,
        Method::GET,
        "/api/reference-lists/person",
        None,
        StatusCode::NOT_FOUND,
        "reference_list_not_found",
    )
    .await;
}

// --- Changing an entity safely ---------------------------------------------

// C5-3
#[tokio::test]
async fn adding_an_optional_property_keeps_every_row_and_reads_as_no_value() {
    let (state, _dir) = app(true).await;
    let before = all_rows(&state, PERSON).await;

    let updated = change_applied(&state, |definition| {
        push_property(
            definition,
            json!({ "name": "nickname", "displayName": "Nickname", "type": "text", "maxLength": 30 }),
        );
        push_property(
            definition,
            json!({ "name": "newsletter", "displayName": "Newsletter", "type": "boolean" }),
        );
    })
    .await;

    assert_eq!(updated["revision"], 2);
    assert_eq!(updated["rows"], PERSON_COUNT);
    assert_eq!(
        updated["definition"]["properties"][ADDED]["name"],
        "nickname"
    );
    assert_eq!(get(&state, "/api/entities/person").await, updated);

    let after = all_rows(&state, PERSON).await;
    assert_eq!(after.len(), PERSON_COUNT);
    for (old, new) in before.iter().zip(&after) {
        let mut expected = old.clone();
        expected["values"]["nickname"] = Value::Null;
        // A yes/no always has a value: "no" until someone says "yes".
        expected["values"]["newsletter"] = json!(false);
        assert_eq!(new, &expected);
    }

    // The new property takes values like any other.
    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "nickname": "Smithy", "newsletter": true } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["values"]["nickname"], "Smithy");
    assert_eq!(saved["values"]["newsletter"], true);
    let found = query(&state, PERSON, json!({ "search": "smithy" })).await;
    assert_eq!(support::ids(&found), ["person-01"]);
}

// C5-3
#[tokio::test]
async fn changing_text_with_values_to_a_number_is_refused_and_nothing_changes() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;

    let error = change_refused(&state, |definition| {
        let email = property(definition, "email");
        email["type"] = json!("number");
        email.as_object_mut().unwrap().remove("maxLength");
    })
    .await;

    assert_eq!(
        error.error.message,
        "This change would lose data, so nothing was changed."
    );
    let path = format!("properties[{EMAIL}].type");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        "Email has a value in 50 rows, and a text property cannot become a number property without losing them. Clear those values first, or add a new property instead."
    );

    // The definition, its revision and every row are as they were.
    assert_eq!(snapshot(&state).await, before);
    assert_eq!(before.0["revision"], 1);
    assert_eq!(
        before.1[0]["values"]["email"],
        person_values(1)["email"].clone()
    );
}

// C5-3
#[tokio::test]
async fn a_refused_change_undoes_everything_sent_with_it() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;

    // Sound changes beside one that cannot be made: a new property, a
    // deleted one, a new display name.
    let error = change_refused(&state, |definition| {
        definition["displayName"] = json!("Human");
        remove_property(definition, "notes");
        push_property(definition, text("nickname"));
        property(definition, "surname")["type"] = json!("date");
        property(definition, "surname")
            .as_object_mut()
            .unwrap()
            .remove("maxLength");
        definition
            .as_object_mut()
            .unwrap()
            .remove("displayProperty");
        property(definition, "dateOfBirth")["latest"] = json!("1900-01-01");
    })
    .await;

    assert_eq!(
        paths(&error),
        ["properties[1].type", "properties[3].latest"]
    );
    assert_eq!(
        error.error.message,
        "This change would lose data in 2 places, so nothing was changed."
    );
    assert_eq!(snapshot(&state).await, before);
    let with_notes = count_people(|person| !person["notes"].is_null());
    assert!(with_notes > 0);
    let found = query(
        &state,
        PERSON,
        json!({ "filter": [{ "property": "notes", "op": "notEmpty" }] }),
    )
    .await;
    assert_eq!(found["total"], with_notes);
}

// C5-3
#[tokio::test]
async fn a_property_with_no_values_can_change_its_type() {
    let (state, _dir) = app(true).await;
    change_applied(&state, |definition| {
        push_property(definition, text("nickname"));
    })
    .await;

    let updated = change_applied(&state, |definition| {
        let nickname = property(definition, "nickname");
        nickname["type"] = json!("number");
        nickname["whole"] = json!(true);
    })
    .await;
    assert_eq!(updated["revision"], 3);
    assert_eq!(updated["definition"]["properties"][ADDED]["type"], "number");

    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "nickname": 7 } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["values"]["nickname"], 7);

    // With a value, it no longer can.
    let error = change_refused(&state, |definition| {
        let nickname = property(definition, "nickname");
        nickname["type"] = json!("date");
        nickname.as_object_mut().unwrap().remove("whole");
    })
    .await;
    let path = format!("properties[{ADDED}].type");
    assert_eq!(
        message_at(&error, &path),
        "nickname has a value in 1 row, and a number property cannot become a date property without losing them. Clear those values first, or add a new property instead."
    );

    // Cleared, it can again; and a reference keeps working after such a change.
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 2, "values": { "nickname": null } })),
        StatusCode::OK,
    )
    .await;
    change_applied(&state, |definition| {
        let nickname = property(definition, "nickname");
        nickname["type"] = json!("reference");
        nickname["entity"] = json!(ORGANISATION);
        nickname.as_object_mut().unwrap().remove("whole");
    })
    .await;
    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 3, "values": { "nickname": "organisation-2" } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["references"]["nickname"], "Blue Crane Health");
    // A reference column has an index; it goes with the column.
    change_applied(&state, |definition| {
        remove_property(definition, "nickname");
    })
    .await;
    assert_eq!(all_rows(&state, PERSON).await.len(), PERSON_COUNT);
}

// C5-3
#[tokio::test]
async fn a_yes_no_that_was_never_yes_can_change_its_type() {
    let (state, _dir) = app(true).await;
    change_applied(&state, |definition| {
        push_property(
            definition,
            json!({ "name": "newsletter", "displayName": "Newsletter", "type": "boolean" }),
        );
    })
    .await;
    // Saving "no" is not a value worth keeping.
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-02",
        Some(&json!({ "revision": 1, "values": { "newsletter": false } })),
        StatusCode::OK,
    )
    .await;
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "newsletter": true } })),
        StatusCode::OK,
    )
    .await;

    let error = change_refused(&state, |definition| {
        property(definition, "newsletter")["type"] = json!("text");
    })
    .await;
    let path = format!("properties[{ADDED}].type");
    assert!(
        message_at(&error, &path).starts_with("Newsletter has a value in 1 row, and a yes/no"),
        "{error:?}"
    );

    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 2, "values": { "newsletter": false } })),
        StatusCode::OK,
    )
    .await;
    change_applied(&state, |definition| {
        property(definition, "newsletter")["type"] = json!("text");
    })
    .await;
    let row = get(&state, "/api/data/person/person-01").await;
    assert_eq!(row["values"]["newsletter"], Value::Null);
}

// C5-3
#[tokio::test]
async fn whole_numbers_become_decimal_and_keep_their_values() {
    let (state, _dir) = app(true).await;
    let before = all_rows(&state, PERSON).await;

    let updated = change_applied(&state, |definition| {
        property(definition, "dependants")
            .as_object_mut()
            .unwrap()
            .remove("whole");
    })
    .await;
    assert!(
        updated["definition"]["properties"][DEPENDANTS]
            .get("whole")
            .is_none()
    );
    assert_eq!(all_rows(&state, PERSON).await, before);
    assert_eq!(before[1]["values"]["dependants"], json!(3));
    assert_eq!(before[1]["values"]["dependants"].to_string(), "3");

    // With no fraction anywhere, it can go back to whole.
    change_applied(&state, |definition| {
        property(definition, "dependants")["whole"] = json!(true);
    })
    .await;
    assert_eq!(all_rows(&state, PERSON).await, before);
}

// C5-3
#[tokio::test]
async fn decimal_numbers_become_whole_only_when_no_row_has_a_fraction() {
    let (state, _dir) = app(true).await;
    change_applied(&state, |definition| {
        property(definition, "dependants")
            .as_object_mut()
            .unwrap()
            .remove("whole");
    })
    .await;
    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-05",
        Some(&json!({ "revision": 1, "values": { "dependants": 1.5 } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["values"]["dependants"], 1.5);
    let before = snapshot(&state).await;

    let error = change_refused(&state, |definition| {
        property(definition, "dependants")["whole"] = json!(true);
    })
    .await;
    let path = format!("properties[{DEPENDANTS}].whole");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        "1 row has a Dependants that is not a whole number."
    );
    assert_eq!(snapshot(&state).await, before);

    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-05",
        Some(&json!({ "revision": 2, "values": { "dependants": 2 } })),
        StatusCode::OK,
    )
    .await;
    let updated = change_applied(&state, |definition| {
        property(definition, "dependants")["whole"] = json!(true);
    })
    .await;
    assert_eq!(
        updated["definition"]["properties"][DEPENDANTS]["whole"],
        true
    );
}

// C5-3
#[tokio::test]
async fn a_shorter_maximum_length_is_refused_while_longer_values_exist() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let longer = count_people(|person| person["surname"].as_str().unwrap().chars().count() > 5);
    assert!(longer > 1 && longer < PERSON_COUNT);

    let error = change_refused(&state, |definition| {
        property(definition, "surname")["maxLength"] = json!(5);
    })
    .await;
    assert_eq!(paths(&error), ["properties[1].maxLength"]);
    assert_eq!(
        message_at(&error, "properties[1].maxLength"),
        format!("{longer} rows have a Surname longer than 5 characters. Shorten them first.")
    );
    assert_eq!(snapshot(&state).await, before);

    // Longer is always fine, and so is shorter when every value still fits.
    let longest = people()
        .iter()
        .map(|person| person["surname"].as_str().unwrap().chars().count())
        .max()
        .unwrap();
    for max_length in [100, longest] {
        let updated = change_applied(&state, |definition| {
            property(definition, "surname")["maxLength"] = json!(max_length);
        })
        .await;
        assert_eq!(
            updated["definition"]["properties"][1]["maxLength"],
            max_length
        );
    }
    assert_eq!(all_rows(&state, PERSON).await, before.1);

    // A limit where there was none is checked too.
    let error = change_refused(&state, |definition| {
        property(definition, "notes")["maxLength"] = json!(10);
    })
    .await;
    assert_eq!(paths(&error), [format!("properties[{NOTES}].maxLength")]);
}

// C5-3
#[tokio::test]
async fn tighter_number_limits_are_refused_while_values_break_them() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let dependants = |person: &Value| person["dependants"].as_u64().unwrap();
    let none = count_people(|person| dependants(person) < 1);
    let above = count_people(|person| dependants(person) > 3);
    assert!(none > 1 && above > 1);

    let error = change_refused(&state, |definition| {
        property(definition, "dependants")["min"] = json!(1);
    })
    .await;
    let path = format!("properties[{DEPENDANTS}].min");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!("{} have a Dependants below 1.", rows(none))
    );

    let error = change_refused(&state, |definition| {
        property(definition, "dependants")["max"] = json!(3);
    })
    .await;
    let path = format!("properties[{DEPENDANTS}].max");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!("{} have a Dependants above 3.", rows(above))
    );

    // Both at once are both listed.
    let error = change_refused(&state, |definition| {
        property(definition, "dependants")["min"] = json!(1);
        property(definition, "dependants")["max"] = json!(3);
    })
    .await;
    assert_eq!(error.error.details.unwrap().len(), 2);
    assert_eq!(snapshot(&state).await, before);

    // Limits every value is inside are fine, tighter or looser.
    change_applied(&state, |definition| {
        property(definition, "dependants")["min"] = json!(0);
        property(definition, "dependants")["max"] = json!(4);
    })
    .await;
    change_applied(&state, |definition| {
        let dependants = property(definition, "dependants").as_object_mut().unwrap();
        dependants.remove("min");
        dependants.remove("max");
    })
    .await;
    assert_eq!(all_rows(&state, PERSON).await, before.1);
}

// C5-3
#[tokio::test]
async fn tighter_date_limits_are_refused_while_values_break_them() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let born = |person: &Value| person["dateOfBirth"].as_str().unwrap().to_owned();
    let early = count_people(|person| born(person).as_str() < "1970-01-01");
    let late = count_people(|person| born(person).as_str() > "1990-01-01");
    assert!(early > 1 && late > 1);

    let error = change_refused(&state, |definition| {
        property(definition, "dateOfBirth")["earliest"] = json!("1970-01-01");
    })
    .await;
    let path = format!("properties[{DATE_OF_BIRTH}].earliest");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!("{} have a Date of birth before 1970-01-01.", rows(early))
    );

    let error = change_refused(&state, |definition| {
        property(definition, "dateOfBirth")["latest"] = json!("1990-01-01");
    })
    .await;
    let path = format!("properties[{DATE_OF_BIRTH}].latest");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!("{} have a Date of birth after 1990-01-01.", rows(late))
    );
    assert_eq!(snapshot(&state).await, before);

    // The range the values are really in is fine, to the day.
    let first = people().iter().map(born).min().unwrap();
    let last = people().iter().map(born).max().unwrap();
    change_applied(&state, |definition| {
        property(definition, "dateOfBirth")["earliest"] = json!(first);
        property(definition, "dateOfBirth")["latest"] = json!(last);
    })
    .await;
    assert_eq!(all_rows(&state, PERSON).await, before.1);
}

// C5-3
#[tokio::test]
async fn several_lines_cannot_become_one_while_a_value_has_a_line_break() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let broken = count_people(|person| {
        person["notes"]
            .as_str()
            .is_some_and(|notes| notes.contains('\n'))
    });
    assert!(broken > 1);

    let error = change_refused(&state, |definition| {
        property(definition, "notes")
            .as_object_mut()
            .unwrap()
            .remove("multiline");
    })
    .await;
    let path = format!("properties[{NOTES}].multiline");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!(
            "{} have a Notes that runs over several lines.",
            rows(broken)
        )
    );
    assert_eq!(snapshot(&state).await, before);

    // One line becoming several is always fine.
    change_applied(&state, |definition| {
        property(definition, "email")["multiline"] = json!(true);
    })
    .await;
    // And back, while no value has a line break.
    change_applied(&state, |definition| {
        property(definition, "email")
            .as_object_mut()
            .unwrap()
            .remove("multiline");
    })
    .await;
}

// C5-3
#[tokio::test]
async fn a_new_required_property_needs_a_value_for_the_rows_that_exist() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let country = json!({
        "name": "country", "displayName": "Country", "type": "text", "required": true, "maxLength": 40
    });

    let response = put_entity(&state, PERSON, |definition| {
        push_property(definition, country.clone());
    })
    .await;
    let error = expect_refused(response, StatusCode::CONFLICT, "change_refused").await;
    let path = format!("properties[{ADDED}].required");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        "Country is required, and Person already has 50 rows. Give the value those rows should get, or add it as optional."
    );
    assert_eq!(snapshot(&state).await, before);

    // `fill: null` for it is no value either.
    let response = put_entity_with_fill(&state, PERSON, json!({ "country": null }), |definition| {
        push_property(definition, country.clone());
    })
    .await;
    expect_refused(response, StatusCode::CONFLICT, "change_refused").await;
    assert_eq!(snapshot(&state).await, before);

    let response = put_entity_with_fill(
        &state,
        PERSON,
        json!({ "country": "South Africa" }),
        |definition| push_property(definition, country.clone()),
    )
    .await;
    let updated = expect_status(response, StatusCode::OK).await;
    assert_eq!(updated["revision"], 2);
    assert_eq!(updated["rows"], PERSON_COUNT);

    let after = all_rows(&state, PERSON).await;
    assert_eq!(after.len(), PERSON_COUNT);
    for (old, new) in before.1.iter().zip(&after) {
        let mut expected = old.clone();
        expected["values"]["country"] = json!("South Africa");
        assert_eq!(new, &expected);
    }
    // From now on a new row needs one.
    let error = refused(
        &state,
        Method::POST,
        "/api/data/person",
        Some(&json!({ "values": { "firstName": "A", "surname": "B" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(paths(&error), ["country"]);
}

// C5-3
#[tokio::test]
async fn a_new_required_property_needs_no_value_when_there_are_no_rows() {
    let (state, _dir) = app(false).await;
    create_entity(&state, thing(json!([text("title")]))).await;

    let response = put_entity(&state, "thing", |definition| {
        push_property(
            definition,
            json!({ "name": "code", "displayName": "Code", "type": "text", "required": true }),
        );
        property(definition, "title")["required"] = json!(true);
    })
    .await;
    let updated = expect_status(response, StatusCode::OK).await;
    assert_eq!(updated["revision"], 2);
    assert_eq!(updated["definition"]["properties"][1]["required"], true);
}

// C5-3
#[tokio::test]
async fn making_a_property_required_fills_only_the_rows_without_a_value() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let without = count_people(|person| person["organisation"].is_null());
    assert!(without > 1);
    let require = |definition: &mut Value| {
        property(definition, "organisation")["required"] = json!(true);
    };

    let response = put_entity(&state, PERSON, require).await;
    let error = expect_refused(response, StatusCode::CONFLICT, "change_refused").await;
    let path = format!("properties[{ORGANISATION_PROPERTY}].required");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!(
            "Organisation has no value in {}. Give the value those rows should get, or leave it optional.",
            rows(without)
        )
    );
    assert_eq!(snapshot(&state).await, before);

    let fill = json!({ "organisation": "organisation-8" });
    let response = put_entity_with_fill(&state, PERSON, fill, require).await;
    let updated = expect_status(response, StatusCode::OK).await;
    assert_eq!(
        updated["definition"]["properties"][ORGANISATION_PROPERTY]["required"],
        true
    );

    let after = all_rows(&state, PERSON).await;
    let mut filled = 0;
    for (number, (old, new)) in (1..).zip(before.1.iter().zip(&after)) {
        let seeded = person_values(number);
        if seeded["organisation"].is_null() {
            filled += 1;
            assert_eq!(new["values"]["organisation"], "organisation-8");
            assert_eq!(new["references"]["organisation"], "Highveld Mining");
        } else {
            // A row that had a value keeps it.
            assert_eq!(new["values"]["organisation"], seeded["organisation"]);
            assert_eq!(new, old);
        }
    }
    assert_eq!(filled, without);

    // A property every row already has a value for needs no fill.
    let updated = change_applied(&state, |definition| {
        property(definition, "email")["required"] = json!(true);
    })
    .await;
    assert_eq!(updated["definition"]["properties"][EMAIL]["required"], true);
}

// C5-3
#[tokio::test]
async fn a_fill_value_must_fit_its_property() {
    let (state, _dir) = app(true).await;
    let before = snapshot(&state).await;
    let nickname = |required: bool| {
        move |definition: &mut Value| {
            let mut property = json!({
                "name": "nickname", "displayName": "Nickname", "type": "text", "maxLength": 5
            });
            if required {
                property["required"] = json!(true);
            }
            push_property(definition, property);
        }
    };

    let cases = [
        (json!({ "nickname": 5 }), "Enter text"),
        (
            json!({ "nickname": "too long" }),
            "Enter no more than 5 characters",
        ),
        (json!({ "nickname": "" }), "This field is required"),
        (json!({ "nickname": "   " }), "This field is required"),
    ];
    for (fill, message) in cases {
        let response = put_entity_with_fill(&state, PERSON, fill.clone(), nickname(true)).await;
        let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
        assert_eq!(paths(&error), ["fill.nickname"], "{fill}");
        assert_eq!(message_at(&error, "fill.nickname"), message, "{fill}");
    }

    // A value for a property the definition does not have.
    let response =
        put_entity_with_fill(&state, PERSON, json!({ "nope": "x" }), nickname(false)).await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
    assert_eq!(paths(&error), ["fill.nope"]);
    assert_eq!(
        message_at(&error, "fill.nope"),
        "There is no property named \"nope\" to give a value to."
    );

    // Each type is checked as a row's value would be.
    let require = |name: &'static str| {
        move |definition: &mut Value| {
            property(definition, name)["required"] = json!(true);
        }
    };
    let cases = [
        (
            "organisation",
            json!("organisation-99"),
            "There is no Organisation with that id",
        ),
        (
            "status",
            json!("retired-long-ago"),
            "Person status has no item \"retired-long-ago\"",
        ),
        ("dependants", json!(21), "Enter a number that is 20 or less"),
        ("dependants", json!(1.5), "Enter a whole number"),
        (
            "dateOfBirth",
            json!("2001-02-29"),
            "Enter a date as YYYY-MM-DD",
        ),
    ];
    for (name, value, message) in cases {
        let fill = json!({ name: value });
        let response = put_entity_with_fill(&state, PERSON, fill.clone(), require(name)).await;
        let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
        let path = format!("fill.{name}");
        assert_eq!(paths(&error), [path.as_str()], "{fill}");
        assert_eq!(message_at(&error, &path), message, "{fill}");
    }

    assert_eq!(snapshot(&state).await, before);
}

// C5-3
#[tokio::test]
async fn a_deleted_propertys_values_do_not_come_back_with_its_name() {
    let (state, _dir) = app(true).await;
    let before = all_rows(&state, PERSON).await;
    assert!(before.iter().all(|row| row["values"]["email"].is_string()));

    let updated = change_applied(&state, |definition| {
        remove_property(definition, "email");
    })
    .await;
    assert_eq!(updated["rows"], PERSON_COUNT);
    assert_eq!(
        updated["definition"]["properties"]
            .as_array()
            .unwrap()
            .len(),
        7
    );
    let without = all_rows(&state, PERSON).await;
    for (old, new) in before.iter().zip(&without) {
        let mut expected = old.clone();
        expected["values"].as_object_mut().unwrap().remove("email");
        assert_eq!(new, &expected);
    }
    // It is not a property any more: not to save, sort, filter or search by.
    let error = refused(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "email": "a@example.com" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(paths(&error), ["email"]);
    refused(
        &state,
        Method::POST,
        "/api/data/person/query",
        Some(&json!({ "sort": [{ "property": "email" }] })),
        StatusCode::BAD_REQUEST,
        "invalid_query",
    )
    .await;
    assert_eq!(
        query(&state, PERSON, json!({ "search": "example.com" })).await["total"],
        0
    );

    // A property added later with the same name starts empty, whatever its type.
    let updated = change_applied(&state, |definition| {
        push_property(
            definition,
            json!({ "name": "email", "displayName": "Email", "type": "text", "maxLength": 254 }),
        );
    })
    .await;
    assert_eq!(updated["revision"], 3);
    let again = all_rows(&state, PERSON).await;
    assert_eq!(again.len(), PERSON_COUNT);
    for row in &again {
        assert_eq!(row["values"]["email"], Value::Null, "{row}");
    }
    assert_eq!(
        query(&state, PERSON, json!({ "search": "example.com" })).await["total"],
        0
    );
    assert_eq!(
        query(
            &state,
            PERSON,
            json!({ "filter": [{ "property": "email", "op": "notEmpty" }] })
        )
        .await["total"],
        0
    );

    // And it holds new values of its own.
    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "email": "new@example.com" } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["values"]["email"], "new@example.com");
    assert_eq!(saved["values"]["surname"], "Smith");
}

// C5-3
#[tokio::test]
async fn deleting_the_display_property_must_name_another_or_none() {
    let (state, _dir) = app(true).await;

    let response = put_entity(&state, PERSON, |definition| {
        remove_property(definition, "surname");
    })
    .await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
    assert_eq!(paths(&error), ["displayProperty"]);

    change_applied(&state, |definition| {
        remove_property(definition, "surname");
        definition
            .as_object_mut()
            .unwrap()
            .remove("displayProperty");
    })
    .await;
    // Rows are now shown by their id.
    let row = get(&state, "/api/data/person/person-01").await;
    assert_eq!(row["display"], "person-01");
}

// C5-3
#[tokio::test]
async fn a_property_cannot_move_to_a_list_that_lacks_values_rows_hold() {
    let (state, _dir) = app(true).await;
    create_list(
        &state,
        json!({
            "name": "membership",
            "displayName": "Membership",
            "items": [
                { "value": "active", "label": "Member" },
                { "value": "lapsed", "label": "Lapsed" }
            ]
        }),
    )
    .await;
    create_list(
        &state,
        json!({
            "name": "state",
            "displayName": "State",
            "items": [
                { "value": "inactive", "label": "Off" },
                { "value": "pending", "label": "Soon" },
                { "value": "active", "label": "On" },
                { "value": "other", "label": "Other" }
            ]
        }),
    )
    .await;
    create_list(
        &state,
        json!({ "name": "nothing", "displayName": "Nothing", "items": [] }),
    )
    .await;
    let before = snapshot(&state).await;
    let outside = count_people(|person| person["status"] != "active");
    assert!(outside > 1);

    let error = change_refused(&state, |definition| {
        property(definition, "status")["referenceList"] = json!("membership");
    })
    .await;
    let path = format!("properties[{STATUS}].referenceList");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!(
            "{} have a Status that the new list does not have.",
            rows(outside)
        )
    );
    assert_eq!(snapshot(&state).await, before);

    // A list with no items lacks every value.
    let error = change_refused(&state, |definition| {
        property(definition, "status")["referenceList"] = json!("nothing");
    })
    .await;
    assert_eq!(
        message_at(&error, &path),
        "50 rows have a Status that the new list does not have."
    );
    assert_eq!(snapshot(&state).await, before);

    // A list that has every value rows hold is fine; the rows keep them.
    change_applied(&state, |definition| {
        property(definition, "status")["referenceList"] = json!("state");
    })
    .await;
    assert_eq!(all_rows(&state, PERSON).await, before.1);
    // The old list is free to go now.
    no_content(&state, Method::DELETE, "/api/reference-lists/personStatus").await;
}

// C5-3
#[tokio::test]
async fn a_reference_with_values_cannot_point_at_another_entity() {
    let (state, _dir) = app(true).await;
    create_entity(
        &state,
        json!({ "name": "club", "displayName": "Club", "properties": [text("name")] }),
    )
    .await;
    let before = snapshot(&state).await;
    let held = count_people(|person| !person["organisation"].is_null());

    let error = change_refused(&state, |definition| {
        property(definition, "organisation")["entity"] = json!("club");
    })
    .await;
    let path = format!("properties[{ORGANISATION_PROPERTY}].entity");
    assert_eq!(paths(&error), [path.as_str()]);
    assert_eq!(
        message_at(&error, &path),
        format!(
            "Organisation refers to a row in {}. It cannot point at another entity without losing them.",
            rows(held)
        )
    );
    assert_eq!(snapshot(&state).await, before);

    // With no values it can.
    for row in &before.1 {
        if row["values"]["organisation"].is_null() {
            continue;
        }
        let uri = format!("/api/data/person/{}", row["id"].as_str().unwrap());
        let body = json!({ "revision": 1, "values": { "organisation": null } });
        support::ok(&state, Method::PATCH, &uri, Some(&body), StatusCode::OK).await;
    }
    change_applied(&state, |definition| {
        property(definition, "organisation")["entity"] = json!("club");
    })
    .await;
    let club = create_row(&state, "club", json!({ "name": "Chess" })).await;
    let error = refused(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 2, "values": { "organisation": "organisation-1" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(
        message_at(&error, "organisation"),
        "There is no Club with that id"
    );
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 2, "values": { "organisation": club["id"] } })),
        StatusCode::OK,
    )
    .await;
    // Organisation is no longer referred to, so it can be deleted.
    no_content(&state, Method::DELETE, "/api/entities/organisation").await;
}

#[tokio::test]
async fn a_default_form_that_was_deleted_does_not_block_other_changes() {
    let (state, _dir) = app(true).await;
    no_content(&state, Method::DELETE, "/api/forms/person").await;

    // The stored definition still names it; saving something else drops it.
    let updated = change_applied(&state, |definition| {
        assert_eq!(definition["defaultForm"], PERSON_FORM_ID);
        definition["displayName"] = json!("Human");
    })
    .await;
    assert!(updated["definition"].get("defaultForm").is_none());

    // Naming a form that is not there is still refused.
    let response = put_entity(&state, PERSON, |definition| {
        definition["defaultForm"] = json!("gone");
    })
    .await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
    assert_eq!(paths(&error), ["defaultForm"]);
}

// --- Deleting entities -----------------------------------------------------

#[tokio::test]
async fn an_entity_others_refer_to_cannot_be_deleted() {
    let (state, _dir) = app(true).await;
    let before = tables(&state).await;

    let error = refused(
        &state,
        Method::DELETE,
        "/api/entities/organisation",
        None,
        StatusCode::CONFLICT,
        "entity_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        "Organisation cannot be deleted while other entities refer to it: Organisation of Person. Delete or change that property first."
    );
    assert_eq!(get(&state, "/api/entities/organisation").await["rows"], 8);
    assert_eq!(tables(&state).await, before);

    // Person is not referred to by anything.
    no_content(&state, Method::DELETE, "/api/entities/person").await;
    assert_eq!(tables(&state).await.len(), before.len() - 1);
    for (method, uri, body) in [
        (Method::GET, "/api/entities/person", None),
        (Method::DELETE, "/api/entities/person", None),
        (Method::POST, "/api/data/person/query", Some(json!({}))),
        (Method::GET, "/api/data/person/person-01", None),
        (
            Method::POST,
            "/api/data/person",
            Some(json!({ "values": { "firstName": "A", "surname": "B" } })),
        ),
        (
            Method::PATCH,
            "/api/data/person/person-01",
            Some(json!({ "revision": 1, "values": {} })),
        ),
        (Method::DELETE, "/api/data/person/person-01", None),
    ] {
        let error = refused(
            &state,
            method,
            uri,
            body.as_ref(),
            StatusCode::NOT_FOUND,
            "entity_not_found",
        )
        .await;
        assert_eq!(error.error.message, "There is no entity named person.");
    }
    let names: Vec<Value> = get(&state, "/api/entities").await["entities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entity| entity["name"].clone())
        .collect();
    assert_eq!(names, [ORGANISATION]);

    // Nothing refers to Organisation now.
    no_content(&state, Method::DELETE, "/api/entities/organisation").await;
    assert_eq!(
        get(&state, "/api/entities").await,
        json!({ "entities": [] })
    );
    assert_eq!(tables(&state).await.len(), before.len() - 2);
    // The list no property uses any more can go too.
    no_content(&state, Method::DELETE, "/api/reference-lists/personStatus").await;
}

#[tokio::test]
async fn every_property_that_refers_to_an_entity_is_named_when_its_delete_is_refused() {
    let (state, _dir) = app(true).await;
    create_entity(
        &state,
        json!({
            "name": "contract",
            "displayName": "Contract",
            "properties": [
                { "name": "client", "displayName": "Client", "type": "reference", "entity": "organisation" },
                { "name": "supplier", "displayName": "Supplier", "type": "reference", "entity": "organisation" }
            ]
        }),
    )
    .await;

    let error = refused(
        &state,
        Method::DELETE,
        "/api/entities/organisation",
        None,
        StatusCode::CONFLICT,
        "entity_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        "Organisation cannot be deleted while other entities refer to it: Client of Contract, Supplier of Contract, Organisation of Person. Delete or change those properties first."
    );
}

#[tokio::test]
async fn an_entity_that_refers_only_to_itself_can_be_deleted() {
    let (state, _dir) = app(false).await;
    create_entity(
        &state,
        json!({
            "name": "employee",
            "displayName": "Employee",
            "properties": [
                text("name"),
                { "name": "manager", "displayName": "Manager", "type": "reference", "entity": "employee" }
            ],
            "displayProperty": "name"
        }),
    )
    .await;
    let boss = create_row(&state, "employee", json!({ "name": "Boss" })).await;
    create_row(
        &state,
        "employee",
        json!({ "name": "Report", "manager": boss["id"] }),
    )
    .await;

    no_content(&state, Method::DELETE, "/api/entities/employee").await;
    assert_eq!(
        get(&state, "/api/entities").await,
        json!({ "entities": [] })
    );

    // The name is free again, and the new entity starts with no rows.
    create_entity(
        &state,
        json!({ "name": "employee", "displayName": "Employee", "properties": [text("name")] }),
    )
    .await;
    assert_eq!(query(&state, "employee", json!({})).await["total"], 0);
}

// --- Reference lists -------------------------------------------------------

// C5-13
#[tokio::test]
async fn items_can_be_reordered_renamed_and_retired() {
    let (state, _dir) = app(true).await;
    let rows_before = all_rows(&state, PERSON).await;

    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["displayName"] = json!("Membership");
        definition["items"] = json!([
            { "value": "inactive", "label": "Dormant", "color": "destructive" },
            { "value": "active", "label": "Active", "color": "success" },
            { "value": "pending", "label": "Waiting", "color": "warning", "retired": true },
            { "value": "new", "label": "New", "color": "info" }
        ]);
    })
    .await;
    let updated = expect_status(response, StatusCode::OK).await;

    assert_eq!(updated["name"], PERSON_STATUS);
    assert_eq!(updated["revision"], 2);
    let expected = json!({
        "name": "personStatus",
        "displayName": "Membership",
        "items": [
            { "value": "inactive", "label": "Dormant", "color": "destructive" },
            { "value": "active", "label": "Active", "color": "success" },
            { "value": "pending", "label": "Waiting", "color": "warning", "retired": true },
            { "value": "new", "label": "New", "color": "info" }
        ]
    });
    assert_eq!(updated["definition"], expected);
    assert_eq!(
        get(&state, "/api/reference-lists/personStatus").await,
        updated
    );
    assert_eq!(
        get(&state, "/api/reference-lists").await["referenceLists"][0],
        updated
    );

    // Rows hold values, not labels: nothing about them changed.
    assert_eq!(all_rows(&state, PERSON).await, rows_before);

    // Sorting follows the new order, and search the new labels.
    let sorted = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "status" }], "pageSize": 200 }),
    )
    .await;
    let position = |value: &Value| match value.as_str().unwrap() {
        "inactive" => 0,
        "active" => 1,
        "pending" => 2,
        other => panic!("unexpected status {other}"),
    };
    let order: Vec<i32> = support::column(&sorted, "status")
        .into_iter()
        .map(position)
        .collect();
    assert!(order.is_sorted(), "{order:?}");
    let pending = count_people(|person| person["status"] == "pending");
    assert_eq!(
        query(&state, PERSON, json!({ "search": "waiting" })).await["total"],
        pending
    );
    assert_eq!(
        query(&state, PERSON, json!({ "search": "Pending" })).await["total"],
        0
    );
}

// C5-13
#[tokio::test]
async fn an_item_rows_hold_cannot_be_deleted_only_retired() {
    let (state, _dir) = app(true).await;
    let before = get(&state, "/api/reference-lists/personStatus").await;
    let pending = count_people(|person| person["status"] == "pending");
    assert_eq!(pending, 10);

    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["displayName"] = json!("Changed");
        definition["items"]
            .as_array_mut()
            .unwrap()
            .retain(|item| item["value"] != "pending");
    })
    .await;
    let error = expect_refused(response, StatusCode::CONFLICT, "item_in_use").await;
    assert_eq!(
        error.error.message,
        "Items that rows use cannot be deleted, so nothing was changed."
    );
    assert_eq!(paths(&error), ["items"]);
    assert_eq!(
        message_at(&error, "items"),
        "Pending is the Status of 10 rows of Person. Retire it instead of deleting it."
    );
    assert_eq!(
        get(&state, "/api/reference-lists/personStatus").await,
        before
    );

    // Every item in use is listed.
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"] = json!([]);
    })
    .await;
    let error = expect_refused(response, StatusCode::CONFLICT, "item_in_use").await;
    assert_eq!(paths(&error), ["items", "items", "items"]);
    assert_eq!(
        get(&state, "/api/reference-lists/personStatus").await,
        before
    );
}

// C5-13
#[tokio::test]
async fn an_item_no_row_holds_can_be_deleted() {
    let (state, _dir) = app(true).await;
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"]
            .as_array_mut()
            .unwrap()
            .push(json!({ "value": "guest", "label": "Guest" }));
    })
    .await;
    expect_status(response, StatusCode::OK).await;

    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"]
            .as_array_mut()
            .unwrap()
            .retain(|item| item["value"] != "guest");
    })
    .await;
    let updated = expect_status(response, StatusCode::OK).await;
    assert_eq!(updated["revision"], 3);
    assert_eq!(updated["definition"]["items"].as_array().unwrap().len(), 3);

    // Once no row holds it, an item that was in use can go as well.
    let people_rows = all_rows(&state, PERSON).await;
    for row in &people_rows {
        if row["values"]["status"] != "inactive" {
            continue;
        }
        let uri = format!("/api/data/person/{}", row["id"].as_str().unwrap());
        let body = json!({ "revision": 1, "values": { "status": null } });
        support::ok(&state, Method::PATCH, &uri, Some(&body), StatusCode::OK).await;
    }
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"]
            .as_array_mut()
            .unwrap()
            .retain(|item| item["value"] != "inactive");
    })
    .await;
    let updated = expect_status(response, StatusCode::OK).await;
    assert_eq!(updated["definition"]["items"].as_array().unwrap().len(), 2);
}

// C5-13
#[tokio::test]
async fn a_list_a_property_uses_cannot_be_deleted() {
    let (state, _dir) = app(true).await;

    let error = refused(
        &state,
        Method::DELETE,
        "/api/reference-lists/personStatus",
        None,
        StatusCode::CONFLICT,
        "reference_list_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        "Person status cannot be deleted while properties use it: Status of Person."
    );
    assert_eq!(
        get(&state, "/api/reference-lists/personStatus").await["revision"],
        1
    );

    // A list nothing uses can.
    create_list(
        &state,
        json!({ "name": "spare", "displayName": "Spare", "items": [{ "value": "a", "label": "A" }] }),
    )
    .await;
    no_content(&state, Method::DELETE, "/api/reference-lists/spare").await;
    refused(
        &state,
        Method::GET,
        "/api/reference-lists/spare",
        None,
        StatusCode::NOT_FOUND,
        "reference_list_not_found",
    )
    .await;

    // Once the property is gone, so can the list it used.
    change_applied(&state, |definition| {
        remove_property(definition, "status");
    })
    .await;
    no_content(&state, Method::DELETE, "/api/reference-lists/personStatus").await;
    assert_eq!(
        get(&state, "/api/reference-lists").await,
        json!({ "referenceLists": [] })
    );
}

// C5-13
#[tokio::test]
async fn a_retired_item_stays_on_rows_that_hold_it_but_cannot_be_newly_chosen() {
    let (state, _dir) = app(true).await;
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"][1]["retired"] = json!(true);
    })
    .await;
    expect_status(response, StatusCode::OK).await;

    // person-07 is Pending, person-01 is Active.
    assert_eq!(person_values(7)["status"], "pending");
    assert_eq!(person_values(1)["status"], "active");
    let holder = get(&state, &format!("/api/data/person/{}", person_id(7))).await;
    assert_eq!(holder["values"]["status"], "pending");
    let pending = count_people(|person| person["status"] == "pending");
    let found = query(
        &state,
        PERSON,
        json!({ "filter": [{ "property": "status", "op": "eq", "value": "pending" }] }),
    )
    .await;
    assert_eq!(found["total"], pending);
    assert_eq!(
        query(&state, PERSON, json!({ "search": "Pending" })).await["total"],
        pending
    );

    // Not for a new row.
    let error = refused(
        &state,
        Method::POST,
        "/api/data/person",
        Some(
            &json!({ "values": { "firstName": "New", "surname": "Person", "status": "pending" } }),
        ),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(paths(&error), ["status"]);
    assert_eq!(
        message_at(&error, "status"),
        "Pending is retired and can no longer be chosen"
    );

    // Not newly on a row that holds something else.
    let error = refused(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "status": "pending" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;
    assert_eq!(paths(&error), ["status"]);
    assert_eq!(
        get(&state, "/api/data/person/person-01").await["values"]["status"],
        "active"
    );

    // A row that holds it is saved again with it, unchanged.
    let saved = support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-07",
        Some(&json!({ "revision": 1, "values": { "surname": "Renamed", "status": "pending" } })),
        StatusCode::OK,
    )
    .await;
    assert_eq!(saved["revision"], 2);
    assert_eq!(saved["values"]["status"], "pending");
    assert_eq!(saved["values"]["surname"], "Renamed");

    // Once it moves off the retired item, it cannot go back.
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-07",
        Some(&json!({ "revision": 2, "values": { "status": "active" } })),
        StatusCode::OK,
    )
    .await;
    refused(
        &state,
        Method::PATCH,
        "/api/data/person/person-07",
        Some(&json!({ "revision": 3, "values": { "status": "pending" } })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await;

    // Nor can it fill the rows of a property that becomes required.
    let response = put_entity_with_fill(&state, PERSON, json!({ "status": "pending" }), |d| {
        property(d, "status")["required"] = json!(true);
    })
    .await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_entity").await;
    assert_eq!(paths(&error), ["fill.status"]);

    // Brought back, it can be chosen again.
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"][1]
            .as_object_mut()
            .unwrap()
            .remove("retired");
    })
    .await;
    expect_status(response, StatusCode::OK).await;
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-07",
        Some(&json!({ "revision": 3, "values": { "status": "pending" } })),
        StatusCode::OK,
    )
    .await;
}

// --- Demo reset ------------------------------------------------------------

#[tokio::test]
async fn demo_puts_the_definitions_and_rows_back_to_the_seed_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    let open = || async {
        AppState {
            pool: db::prepare(&path, true).await.unwrap(),
            assets: std::sync::Arc::new(NoAssets),
        }
    };

    let state = open().await;
    let entities = get(&state, "/api/entities").await;
    let lists = get(&state, "/api/reference-lists").await;
    let people_rows = all_rows(&state, PERSON).await;
    let organisations = all_rows(&state, ORGANISATION).await;

    // Change a bit of everything.
    create_vehicle(&state).await;
    create_row(&state, "vehicle", json!({ "registration": "X" })).await;
    change_applied(&state, |definition| {
        definition["displayName"] = json!("Human");
        remove_property(definition, "notes");
        push_property(definition, text("nickname"));
    })
    .await;
    let response = put_list(&state, PERSON_STATUS, |definition| {
        definition["items"][0]["label"] = json!("On");
        definition["items"][1]["retired"] = json!(true);
    })
    .await;
    expect_status(response, StatusCode::OK).await;
    no_content(&state, Method::DELETE, "/api/data/person/person-50").await;
    support::ok(
        &state,
        Method::PATCH,
        "/api/data/person/person-01",
        Some(&json!({ "revision": 1, "values": { "surname": "Changed", "organisation": null } })),
        StatusCode::OK,
    )
    .await;
    create_row(&state, ORGANISATION, json!({ "name": "Ninth" })).await;
    state.pool.close().await;

    let state = open().await;
    // Everything but the times is exactly as it was first seeded.
    let timeless = |mut value: Value| {
        fn strip(value: &mut Value) {
            match value {
                Value::Object(object) => {
                    object.remove("updatedAt");
                    object.remove("createdAt");
                    object.values_mut().for_each(strip);
                }
                Value::Array(items) => items.iter_mut().for_each(strip),
                _ => {}
            }
        }
        strip(&mut value);
        value
    };
    assert_eq!(
        timeless(get(&state, "/api/entities").await),
        timeless(entities)
    );
    assert_eq!(
        timeless(get(&state, "/api/reference-lists").await),
        timeless(lists)
    );
    assert_eq!(
        timeless(all_rows(&state, PERSON).await.into()),
        timeless(people_rows.into())
    );
    assert_eq!(
        timeless(all_rows(&state, ORGANISATION).await.into()),
        timeless(organisations.into())
    );
    for (number, row) in (1..).zip(all_rows(&state, PERSON).await) {
        assert_eq!(row["id"], person_id(number));
        assert_eq!(row["revision"], 1);
        assert_eq!(row["values"], person_values(number));
    }
    refused(
        &state,
        Method::GET,
        "/api/entities/vehicle",
        None,
        StatusCode::NOT_FOUND,
        "entity_not_found",
    )
    .await;
    refused(
        &state,
        Method::GET,
        "/api/reference-lists/fuel",
        None,
        StatusCode::NOT_FOUND,
        "reference_list_not_found",
    )
    .await;
}

struct NoAssets;

impl server::assets::AssetSource for NoAssets {
    fn get(&self, _path: &str) -> Option<std::borrow::Cow<'static, [u8]>> {
        None
    }
}
