//! Phase 5: the data API (`/api/data/{entity}`): rows, and the one list
//! query format, driven through the real router in memory. The definitions
//! are tested in `entities.rs`.

mod support;

/// An operator's name and what it means, to check a filter against.
type Comparison<T> = (&'static str, fn(T, T) -> bool);
/// The same, for text.
type TextComparison = (&'static str, for<'a> fn(&'a str, &'a str) -> bool);

use std::collections::{BTreeSet, HashMap};
use std::time::{Duration, Instant};

use axum::http::{Method, StatusCode};
use axum::response::Response;
use contracts::ApiError;
use serde_json::{Value, json};
use server::AppState;
use server::entities::catalog::Catalog;
use server::entities::seed::{
    ORGANISATION, ORGANISATION_COUNT, PERSON, PERSON_COUNT, organisation_id, person_id,
    person_values,
};
use support::{
    all_rows, app, column, create_entity, create_list, create_row, expect_refused, expect_status,
    get, ids, message_at, no_content, paths, put_list, query, refused, send, tables,
};

/// A seeded person: the id and the values the seed gives it.
struct Seeded {
    id: String,
    values: Value,
}

impl Seeded {
    fn text(&self, property: &str) -> Option<&str> {
        self.values[property].as_str()
    }

    fn lower(&self, property: &str) -> String {
        self.text(property).unwrap_or_default().to_lowercase()
    }

    fn dependants(&self) -> u64 {
        self.values["dependants"].as_u64().unwrap()
    }
}

/// Every seeded person, in seed order.
fn people() -> Vec<Seeded> {
    (1..=PERSON_COUNT)
        .map(|number| Seeded {
            id: person_id(number),
            values: person_values(number),
        })
        .collect()
}

/// The ids of the seeded people `keep` is true for, in seed order.
fn ids_where(keep: impl Fn(&Seeded) -> bool) -> Vec<String> {
    people()
        .into_iter()
        .filter(|person| keep(person))
        .map(|person| person.id)
        .collect()
}

/// The seeded organisations' names by id, read through the API.
async fn organisation_names(state: &AppState) -> HashMap<String, String> {
    all_rows(state, ORGANISATION)
        .await
        .iter()
        .map(|row| {
            (
                row["id"].as_str().unwrap().to_owned(),
                row["values"]["name"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

fn status_label(value: &str) -> &'static str {
    match value {
        "active" => "Active",
        "pending" => "Pending",
        "inactive" => "Inactive",
        other => panic!("unexpected status {other}"),
    }
}

/// What quick search promises, worked out without the server: the text is in
/// a text property, in the label of the status, or in the organisation's name.
fn found_by_search(person: &Seeded, organisations: &HashMap<String, String>, search: &str) -> bool {
    let needle = search.to_lowercase();
    let in_text = ["firstName", "surname", "email", "notes"]
        .iter()
        .any(|property| person.lower(property).contains(&needle));
    let in_status = person
        .text("status")
        .is_some_and(|status| status_label(status).to_lowercase().contains(&needle));
    let in_organisation = person
        .text("organisation")
        .is_some_and(|id| organisations[id].to_lowercase().contains(&needle));
    in_text || in_status || in_organisation
}

/// Runs a query that must fit on one page and returns its ids, after
/// checking that `total` is their number.
async fn matching(state: &AppState, entity: &str, mut body: Value) -> Vec<String> {
    body["pageSize"] = json!(200);
    let page = query(state, entity, body).await;
    let found: Vec<String> = ids(&page).into_iter().map(str::to_owned).collect();
    assert_eq!(page["total"], found.len(), "total is the number of matches");
    found
}

/// As `matching`, for one filter.
async fn filtered(state: &AppState, entity: &str, filter: Value) -> Vec<String> {
    matching(state, entity, json!({ "filter": [filter] })).await
}

async fn bad_query(state: &AppState, body: &Value) -> ApiError {
    refused(
        state,
        Method::POST,
        "/api/data/person/query",
        Some(body),
        StatusCode::BAD_REQUEST,
        "invalid_query",
    )
    .await
}

async fn patch(state: &AppState, entity: &str, id: &str, revision: u64, values: Value) -> Response {
    let uri = format!("/api/data/{entity}/{id}");
    let body = json!({ "revision": revision, "values": values });
    send(state, Method::PATCH, &uri, Some(&body)).await
}

async fn invalid_row(state: &AppState, entity: &str, values: &Value) -> ApiError {
    refused(
        state,
        Method::POST,
        &format!("/api/data/{entity}"),
        Some(&json!({ "values": values })),
        StatusCode::BAD_REQUEST,
        "invalid_row",
    )
    .await
}

fn is_row_id(id: &str) -> bool {
    id.len() == 32
        && id
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// UTC, RFC 3339 with milliseconds: `2026-11-13T09:15:02.417Z`.
fn is_timestamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 24
        && bytes[4] == b'-'
        && bytes[10] == b'T'
        && bytes[19] == b'.'
        && bytes[23] == b'Z'
}

// --- Listing ---------------------------------------------------------------

// C5-4
#[tokio::test]
async fn the_default_query_is_the_first_25_rows_in_seed_order() {
    let (state, _dir) = app(true).await;

    let page = query(&state, PERSON, json!({})).await;

    assert_eq!(page["total"], 50);
    assert_eq!(page["page"], 1);
    assert_eq!(page["pageSize"], 25);
    let expected: Vec<String> = (1..=25).map(person_id).collect();
    assert_eq!(ids(&page), expected);

    // Each row is whole: the system properties, what stands for it, every
    // value, and the display value of what it refers to.
    let organisations = organisation_names(&state).await;
    for (number, row) in (1..).zip(page["rows"].as_array().unwrap()) {
        let seeded = person_values(number);
        assert_eq!(row["revision"], 1);
        assert!(is_timestamp(row["createdAt"].as_str().unwrap()), "{row}");
        assert_eq!(row["updatedAt"], row["createdAt"]);
        assert_eq!(row["display"], seeded["surname"]);
        assert_eq!(row["values"], seeded);
        let references = match seeded["organisation"].as_str() {
            Some(id) => json!({ "organisation": organisations[id] }),
            None => json!({}),
        };
        assert_eq!(row["references"], references);
        assert_eq!(row.as_object().unwrap().len(), 7);
    }
}

// C5-4
#[tokio::test]
async fn paging_covers_every_row_exactly_once_in_order() {
    let (state, _dir) = app(true).await;
    let everyone: Vec<String> = (1..=PERSON_COUNT).map(person_id).collect();

    let mut seen = Vec::new();
    for number in 1..=5 {
        let page = query(&state, PERSON, json!({ "page": number, "pageSize": 10 })).await;
        assert_eq!(page["total"], 50);
        assert_eq!(page["page"], number);
        assert_eq!(page["pageSize"], 10);
        assert_eq!(page["rows"].as_array().unwrap().len(), 10);
        seen.extend(ids(&page).into_iter().map(str::to_owned));
    }
    assert_eq!(seen, everyone);

    // Past the end there is nothing, and the total still stands.
    for number in [6, 7, 4_000_000_000_u32] {
        let page = query(&state, PERSON, json!({ "page": number, "pageSize": 10 })).await;
        assert_eq!(page["rows"], json!([]));
        assert_eq!(page["total"], 50);
        assert_eq!(page["page"], number);
    }

    // A last page that is not full, and the largest page there is.
    let page = query(&state, PERSON, json!({ "page": 4, "pageSize": 15 })).await;
    assert_eq!(ids(&page), &everyone[45..]);
    let page = query(&state, PERSON, json!({ "pageSize": 200 })).await;
    assert_eq!(ids(&page), everyone);

    // Paging a sorted list keeps every row too.
    let mut seen = BTreeSet::new();
    for number in 1..=8 {
        let body = json!({
            "page": number, "pageSize": 7,
            "sort": [{ "property": "dependants", "direction": "desc" }]
        });
        let page = query(&state, PERSON, body).await;
        for id in ids(&page) {
            assert!(seen.insert(id.to_owned()), "{id} came twice");
        }
    }
    assert_eq!(seen.len(), PERSON_COUNT);
}

/// The ids of every person under one sort.
async fn sorted(state: &AppState, sort: Value) -> Vec<String> {
    let page = query(state, PERSON, json!({ "sort": sort, "pageSize": 200 })).await;
    assert_eq!(page["total"], 50);
    ids(&page).into_iter().map(str::to_owned).collect()
}

fn ids_of(people: &[Seeded]) -> Vec<String> {
    people.iter().map(|person| person.id.clone()).collect()
}

// C5-4
#[tokio::test]
async fn sorting_by_surname_goes_both_ways_and_ignores_case() {
    let (state, _dir) = app(true).await;
    // Surnames that differ only by case would tell nothing; these are all
    // different, and some start in lower-case-sensitive places.
    let mut expected = people();
    expected.sort_by_key(|person| (person.lower("surname"), person.id.clone()));

    let ascending = sorted(&state, json!([{ "property": "surname" }])).await;
    assert_eq!(ascending, ids_of(&expected));
    assert_eq!(
        sorted(
            &state,
            json!([{ "property": "surname", "direction": "asc" }])
        )
        .await,
        ascending
    );

    expected.reverse();
    assert_eq!(
        sorted(
            &state,
            json!([{ "property": "surname", "direction": "desc" }])
        )
        .await,
        ids_of(&expected)
    );

    // A lower-case surname sorts among the others, not after them all.
    create_row(
        &state,
        PERSON,
        json!({ "firstName": "Anna", "surname": "de Villiers" }),
    )
    .await;
    let page = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "surname" }], "pageSize": 200, "select": ["surname"] }),
    )
    .await;
    let surnames: Vec<String> = column(&page, "surname")
        .into_iter()
        .map(|surname| surname.as_str().unwrap().to_lowercase())
        .collect();
    assert_eq!(surnames.len(), 51);
    assert!(surnames.is_sorted(), "{surnames:?}");
    let at = surnames.iter().position(|s| s == "de villiers").unwrap();
    assert!(at > 0 && at < 50);
}

// C5-4
#[tokio::test]
async fn sorting_by_several_properties_breaks_ties_with_the_next() {
    let (state, _dir) = app(true).await;

    // First names repeat, so the date of birth decides between them.
    let mut expected = people();
    expected.sort_by(|a, b| {
        a.lower("firstName")
            .cmp(&b.lower("firstName"))
            .then(b.text("dateOfBirth").cmp(&a.text("dateOfBirth")))
            .then(a.id.cmp(&b.id))
    });
    let found = sorted(
        &state,
        json!([
            { "property": "firstName" },
            { "property": "dateOfBirth", "direction": "desc" }
        ]),
    )
    .await;
    assert_eq!(found, ids_of(&expected));

    // A number, then text backwards.
    let mut expected = people();
    expected.sort_by(|a, b| {
        b.dependants()
            .cmp(&a.dependants())
            .then(a.lower("surname").cmp(&b.lower("surname")))
    });
    let found = sorted(
        &state,
        json!([
            { "property": "dependants", "direction": "desc" },
            { "property": "surname", "direction": "asc" }
        ]),
    )
    .await;
    assert_eq!(found, ids_of(&expected));

    // Rows equal under every key keep the order of their ids.
    let mut expected = people();
    expected.sort_by(|a, b| a.dependants().cmp(&b.dependants()).then(a.id.cmp(&b.id)));
    assert_eq!(
        sorted(&state, json!([{ "property": "dependants" }])).await,
        ids_of(&expected)
    );
}

// C5-4
#[tokio::test]
async fn sorting_by_status_follows_the_lists_own_order() {
    let (state, _dir) = app(true).await;
    let position = |person: &Seeded| match person.text("status").unwrap() {
        "active" => 0,
        "pending" => 1,
        "inactive" => 2,
        other => panic!("unexpected status {other}"),
    };

    let mut expected = people();
    expected.sort_by_key(|person| (position(person), person.id.clone()));
    assert_eq!(
        sorted(&state, json!([{ "property": "status" }])).await,
        ids_of(&expected)
    );
    // Alphabetical order would put Inactive before Pending.
    let page = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "status" }], "pageSize": 200 }),
    )
    .await;
    let mut statuses: Vec<&Value> = column(&page, "status");
    statuses.dedup();
    assert_eq!(statuses, ["active", "pending", "inactive"]);

    expected.sort_by(|a, b| position(b).cmp(&position(a)).then(a.id.cmp(&b.id)));
    assert_eq!(
        sorted(
            &state,
            json!([{ "property": "status", "direction": "desc" }])
        )
        .await,
        ids_of(&expected)
    );

    // Reorder the list and the same query follows.
    let response = put_list(&state, "personStatus", |definition| {
        definition["items"].as_array_mut().unwrap().reverse();
    })
    .await;
    expect_status(response, StatusCode::OK).await;
    expected.sort_by(|a, b| position(b).cmp(&position(a)).then(a.id.cmp(&b.id)));
    assert_eq!(
        sorted(&state, json!([{ "property": "status" }])).await,
        ids_of(&expected)
    );
}

// C5-4
#[tokio::test]
async fn sorting_by_a_reference_follows_the_referenced_rows_names() {
    let (state, _dir) = app(true).await;
    let organisations = organisation_names(&state).await;
    // Give the names an order that is not the order of the ids.
    let response = patch(
        &state,
        ORGANISATION,
        "organisation-1",
        1,
        json!({ "name": "zebra Crossing" }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    let name = |person: &Seeded| -> Option<String> {
        person.text("organisation").map(|id| {
            if id == "organisation-1" {
                "zebra crossing".to_owned()
            } else {
                organisations[id].to_lowercase()
            }
        })
    };

    // People with no organisation come first, as rows with no value do.
    let mut expected = people();
    expected.sort_by_key(|person| (name(person), person.id.clone()));
    let found = sorted(&state, json!([{ "property": "organisation" }])).await;
    assert_eq!(found, ids_of(&expected));
    assert!(name(&expected[0]).is_none());
    assert_eq!(
        name(expected.last().unwrap()).as_deref(),
        Some("zebra crossing")
    );

    expected.sort_by(|a, b| name(b).cmp(&name(a)).then(a.id.cmp(&b.id)));
    assert_eq!(
        sorted(
            &state,
            json!([{ "property": "organisation", "direction": "desc" }])
        )
        .await,
        ids_of(&expected)
    );
}

// C5-4
#[tokio::test]
async fn sorting_by_id_and_the_two_times_is_accepted() {
    let (state, _dir) = app(true).await;
    let everyone: Vec<String> = (1..=PERSON_COUNT).map(person_id).collect();
    let reversed: Vec<String> = everyone.iter().rev().cloned().collect();

    assert_eq!(
        sorted(&state, json!([{ "property": "id" }])).await,
        everyone
    );
    assert_eq!(
        sorted(&state, json!([{ "property": "id", "direction": "desc" }])).await,
        reversed
    );
    assert_eq!(
        sorted(&state, json!([{ "property": "createdAt" }])).await,
        everyone
    );
    assert_eq!(
        sorted(&state, json!([{ "property": "updatedAt" }])).await,
        everyone
    );

    // A row saved later is the most recently updated; one created later is
    // the newest.
    tokio::time::sleep(Duration::from_millis(5)).await;
    let response = patch(&state, PERSON, "person-25", 1, json!({ "notes": "Seen." })).await;
    let saved = expect_status(response, StatusCode::OK).await;
    assert!(saved["updatedAt"].as_str().unwrap() > saved["createdAt"].as_str().unwrap());
    let page = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "updatedAt", "direction": "desc" }], "pageSize": 1 }),
    )
    .await;
    assert_eq!(ids(&page), ["person-25"]);

    tokio::time::sleep(Duration::from_millis(5)).await;
    let created = create_row(
        &state,
        PERSON,
        json!({ "firstName": "New", "surname": "Comer" }),
    )
    .await;
    let page = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "createdAt", "direction": "desc" }], "pageSize": 1 }),
    )
    .await;
    assert_eq!(page["rows"][0]["id"], created["id"]);
    assert_eq!(page["total"], 51);
    // By default a new row comes last.
    let page = query(&state, PERSON, json!({ "page": 3 })).await;
    assert_eq!(ids(&page), [created["id"].as_str().unwrap()]);

    // Numbers and dates sort as what they are.
    let page = query(
        &state,
        PERSON,
        json!({ "sort": [{ "property": "dateOfBirth" }], "pageSize": 200 }),
    )
    .await;
    let dates: Vec<&str> = column(&page, "dateOfBirth")
        .into_iter()
        .filter_map(Value::as_str)
        .collect();
    assert_eq!(dates.len(), 50);
    assert!(dates.is_sorted(), "{dates:?}");
}

// C5-4
#[tokio::test]
async fn search_finds_text_in_any_text_property_whatever_its_case() {
    let (state, _dir) = app(true).await;
    let organisations = organisation_names(&state).await;

    for search in ["smi", "SMI", "Smi", "  smi  "] {
        let expected = ids_where(|person| found_by_search(person, &organisations, "smi"));
        // Smith, Smit and Goldsmith: the seed has exactly these three.
        assert_eq!(expected.len(), 3);
        assert_eq!(
            expected,
            ids_where(|person| person.lower("surname").contains("smi"))
        );
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, expected, "{search:?}");
    }

    // Other text properties: a first name, part of an email, notes.
    for search in [
        "thandi",
        "@example.com",
        "remotely",
        "joined in 2012",
        "van der",
    ] {
        let expected = ids_where(|person| found_by_search(person, &organisations, search));
        assert!(!expected.is_empty(), "{search:?}");
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, expected, "{search:?}");
    }

    // Numbers and dates are not text, and neither are ids.
    for search in ["1958", "person-01", "organisation-1", "true"] {
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, Vec::<String>::new(), "{search:?}");
    }
    assert_eq!(
        matching(&state, PERSON, json!({ "search": "no such text anywhere" })).await,
        Vec::<String>::new()
    );
}

// C5-4
#[tokio::test]
async fn search_by_an_organisations_name_finds_exactly_its_people() {
    let (state, _dir) = app(true).await;
    let organisations = organisation_names(&state).await;
    assert_eq!(organisations.len(), ORGANISATION_COUNT);

    for number in 1..=ORGANISATION_COUNT {
        let id = organisation_id(number);
        let name = &organisations[&id];
        let members = ids_where(|person| person.text("organisation") == Some(id.as_str()));
        assert!(!members.is_empty());

        let found = matching(&state, PERSON, json!({ "search": name })).await;
        assert_eq!(found, members, "{name}");
        // Part of the name, in another case, does the same as the rule says.
        let part = name.split(' ').next().unwrap().to_uppercase();
        let expected = ids_where(|person| found_by_search(person, &organisations, &part));
        let found = matching(&state, PERSON, json!({ "search": part })).await;
        assert_eq!(found, expected, "{part}");
        assert!(members.iter().all(|member| found.contains(member)));
    }
}

// C5-4
#[tokio::test]
async fn search_by_a_status_label_finds_exactly_the_rows_with_that_status() {
    let (state, _dir) = app(true).await;
    let pending = ids_where(|person| person.text("status") == Some("pending"));
    assert_eq!(pending.len(), 10);

    for search in ["Pending", "pending", "PEND"] {
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, pending, "{search:?}");
    }
    // "active" is in both Active and Inactive.
    let found = matching(&state, PERSON, json!({ "search": "active" })).await;
    assert_eq!(
        found,
        ids_where(|person| person.text("status") != Some("pending"))
    );
    let found = matching(&state, PERSON, json!({ "search": "inactive" })).await;
    assert_eq!(
        found,
        ids_where(|person| person.text("status") == Some("inactive"))
    );
}

// C5-4
#[tokio::test]
async fn search_takes_percent_and_underscore_literally() {
    let (state, _dir) = app(true).await;

    // As wildcards these would match every row.
    for search in ["%", "_", "%%", "s_i", "smi%", "%smi", "\\", "\\%"] {
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, Vec::<String>::new(), "{search:?}");
    }

    let odd = create_row(
        &state,
        PERSON,
        json!({ "firstName": "Percy", "surname": "100%_sure", "notes": "back\\slash" }),
    )
    .await;
    let odd_id = odd["id"].as_str().unwrap().to_owned();
    for search in ["%", "_", "%_", "100%", "0%_s", "\\", "k\\s"] {
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, std::slice::from_ref(&odd_id), "{search:?}");
    }
    // The same goes for the text filters.
    for (op, value) in [
        ("contains", "%_"),
        ("startsWith", "100%"),
        ("eq", "100%_SURE"),
    ] {
        let filter = json!({ "property": "surname", "op": op, "value": value });
        assert_eq!(
            filtered(&state, PERSON, filter).await,
            std::slice::from_ref(&odd_id),
            "{op}"
        );
    }
    for (op, value) in [("contains", "%"), ("startsWith", "_"), ("eq", "%")] {
        let filter = json!({ "property": "firstName", "op": op, "value": value });
        assert_eq!(
            filtered(&state, PERSON, filter).await,
            Vec::<String>::new(),
            "{op}"
        );
    }
}

// C5-4
#[tokio::test]
async fn a_blank_search_is_no_search() {
    let (state, _dir) = app(true).await;
    let everyone = query(&state, PERSON, json!({})).await;

    for search in [json!(""), json!("   "), json!("\t\n"), Value::Null] {
        let page = query(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(page, everyone, "{search:?}");
    }
}

// --- Filters ---------------------------------------------------------------

// C5-5
#[tokio::test]
async fn filters_and_search_narrow_together_and_total_is_the_count() {
    let (state, _dir) = app(true).await;
    let organisations = organisation_names(&state).await;
    let pending = |person: &Seeded| person.text("status") == Some("pending");
    let born_between = |person: &Seeded, from: &str, to: &str| {
        let born = person.text("dateOfBirth").unwrap();
        from <= born && born <= to
    };
    let (from, to) = ("1965-01-01", "1989-12-31");
    let filter = json!([
        { "property": "status", "op": "eq", "value": "pending" },
        { "property": "dateOfBirth", "op": "gte", "value": from },
        { "property": "dateOfBirth", "op": "lte", "value": to }
    ]);

    let only_status = ids_where(pending);
    let in_range = ids_where(|person| pending(person) && born_between(person, from, to));
    // The range really narrows, and leaves something.
    assert!(!in_range.is_empty() && in_range.len() < only_status.len());

    let page = query(&state, PERSON, json!({ "filter": filter })).await;
    assert_eq!(ids(&page), in_range);
    assert_eq!(page["total"], in_range.len());
    for row in page["rows"].as_array().unwrap() {
        assert_eq!(row["values"]["status"], "pending");
        let born = row["values"]["dateOfBirth"].as_str().unwrap();
        assert!(from <= born && born <= to, "{born}");
    }

    // Then a search on top: an organisation's name narrows further.
    let organisation = people()
        .iter()
        .find(|person| pending(person) && born_between(person, from, to))
        .and_then(|person| person.text("organisation").map(str::to_owned))
        .unwrap();
    let search = organisations[&organisation].clone();
    let with_search = ids_where(|person| {
        pending(person)
            && born_between(person, from, to)
            && found_by_search(person, &organisations, &search)
    });
    assert!(!with_search.is_empty() && with_search.len() < in_range.len());
    let page = query(
        &state,
        PERSON,
        json!({ "filter": filter, "search": search }),
    )
    .await;
    assert_eq!(ids(&page), with_search);
    assert_eq!(page["total"], with_search.len());

    // The total is of every page, not of the one returned.
    let page = query(
        &state,
        PERSON,
        json!({ "filter": filter, "pageSize": 2, "page": 2 }),
    )
    .await;
    assert_eq!(page["total"], in_range.len());
    assert_eq!(ids(&page), &in_range[2..in_range.len().min(4)]);

    // Filters that cannot both hold match nothing.
    let page = query(
        &state,
        PERSON,
        json!({ "filter": [
            { "property": "status", "op": "eq", "value": "pending" },
            { "property": "status", "op": "eq", "value": "active" }
        ] }),
    )
    .await;
    assert_eq!(page["total"], 0);
    assert_eq!(page["rows"], json!([]));
}

// C5-5
#[tokio::test]
async fn text_filters_compare_equal_contains_starts_with_and_empty() {
    let (state, _dir) = app(true).await;
    let filter = |op: &str, value: &str| json!({ "property": "surname", "op": op, "value": value });

    // Equal ignores case, and is the whole value.
    for value in ["Smith", "smith", "SMITH"] {
        assert_eq!(
            filtered(&state, PERSON, filter("eq", value)).await,
            ["person-01"]
        );
    }
    assert_eq!(
        filtered(&state, PERSON, filter("eq", "Smi")).await,
        Vec::<String>::new()
    );

    let containing = ids_where(|person| person.lower("surname").contains("smi"));
    assert_eq!(containing.len(), 3);
    assert_eq!(
        filtered(&state, PERSON, filter("contains", "SMI")).await,
        containing
    );
    let starting = ids_where(|person| person.lower("surname").starts_with("smi"));
    assert_eq!(starting.len(), 2);
    assert_eq!(
        filtered(&state, PERSON, filter("startsWith", "smi")).await,
        starting
    );
    // A filter looks at its own property only: the email has "smi" too.
    let in_first_name = ids_where(|person| person.lower("firstName").contains("an"));
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "firstName", "op": "contains", "value": "an" })
        )
        .await,
        in_first_name
    );

    let without_notes = ids_where(|person| person.values["notes"].is_null());
    let with_notes = ids_where(|person| !person.values["notes"].is_null());
    assert!(!without_notes.is_empty() && !with_notes.is_empty());
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "notes", "op": "empty" })
        )
        .await,
        without_notes
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "notes", "op": "notEmpty" })
        )
        .await,
        with_notes
    );
    // A value sent with them is not needed and not held against the caller.
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "notes", "op": "empty", "value": null })
        )
        .await,
        without_notes
    );
}

// C5-5
#[tokio::test]
async fn number_filters_compare_in_every_direction() {
    let (state, _dir) = app(true).await;
    let compare: [Comparison<u64>; 5] = [
        ("eq", |a, b| a == b),
        ("gt", |a, b| a > b),
        ("gte", |a, b| a >= b),
        ("lt", |a, b| a < b),
        ("lte", |a, b| a <= b),
    ];

    for (op, holds) in compare {
        let expected = ids_where(|person| holds(person.dependants(), 2));
        assert!(!expected.is_empty() && expected.len() < PERSON_COUNT);
        let filter = json!({ "property": "dependants", "op": op, "value": 2 });
        assert_eq!(filtered(&state, PERSON, filter).await, expected, "{op}");
    }
    // A fraction is a number to compare with, even for a whole-number property.
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dependants", "op": "gt", "value": 2.5 })
        )
        .await,
        ids_where(|person| person.dependants() > 2)
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dependants", "op": "eq", "value": 2.5 })
        )
        .await,
        Vec::<String>::new()
    );

    let response = patch(
        &state,
        PERSON,
        "person-03",
        1,
        json!({ "dependants": null }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dependants", "op": "empty" })
        )
        .await,
        ["person-03"]
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dependants", "op": "notEmpty" })
        )
        .await
        .len(),
        49
    );
    // A row with no value is neither above nor below anything.
    let below = filtered(
        &state,
        PERSON,
        json!({ "property": "dependants", "op": "lt", "value": 100 }),
    )
    .await;
    assert_eq!(below.len(), 49);
}

// C5-5
#[tokio::test]
async fn date_filters_compare_in_every_direction() {
    let (state, _dir) = app(true).await;
    let day = person_values(10)["dateOfBirth"]
        .as_str()
        .unwrap()
        .to_owned();
    let compare: [TextComparison; 5] = [
        ("eq", |a, b| a == b),
        ("gt", |a, b| a > b),
        ("gte", |a, b| a >= b),
        ("lt", |a, b| a < b),
        ("lte", |a, b| a <= b),
    ];

    for (op, holds) in compare {
        let expected = ids_where(|person| holds(person.text("dateOfBirth").unwrap(), &day));
        assert!(!expected.is_empty() && expected.len() < PERSON_COUNT);
        let filter = json!({ "property": "dateOfBirth", "op": op, "value": day });
        assert_eq!(filtered(&state, PERSON, filter).await, expected, "{op}");
    }

    let response = patch(
        &state,
        PERSON,
        "person-03",
        1,
        json!({ "dateOfBirth": null }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dateOfBirth", "op": "empty" })
        )
        .await,
        ["person-03"]
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "dateOfBirth", "op": "notEmpty" })
        )
        .await
        .len(),
        49
    );
}

// C5-5
#[tokio::test]
async fn a_yes_no_filter_treats_never_set_as_no() {
    let (state, _dir) = app(false).await;
    create_entity(
        &state,
        json!({
            "name": "task",
            "displayName": "Task",
            "properties": [
                { "name": "title", "displayName": "Title", "type": "text" },
                { "name": "done", "displayName": "Done", "type": "boolean" }
            ],
            "displayProperty": "title"
        }),
    )
    .await;
    let done = create_row(&state, "task", json!({ "title": "Done", "done": true })).await;
    let open = create_row(&state, "task", json!({ "title": "Open", "done": false })).await;
    let unset = create_row(&state, "task", json!({ "title": "Unset" })).await;
    let cleared = create_row(&state, "task", json!({ "title": "Cleared", "done": null })).await;
    let id = |row: &Value| row["id"].as_str().unwrap().to_owned();

    let yes = filtered(
        &state,
        "task",
        json!({ "property": "done", "op": "eq", "value": true }),
    )
    .await;
    assert_eq!(yes, [id(&done)]);

    let no: BTreeSet<String> = filtered(
        &state,
        "task",
        json!({ "property": "done", "op": "eq", "value": false }),
    )
    .await
    .into_iter()
    .collect();
    assert_eq!(no, BTreeSet::from([id(&open), id(&unset), id(&cleared)]));

    // A yes/no added to rows that exist reads, and filters, as "no".
    let response = support::put_entity(&state, "task", |definition| {
        definition["properties"]
            .as_array_mut()
            .unwrap()
            .push(json!({
                "name": "urgent", "displayName": "Urgent", "type": "boolean"
            }));
    })
    .await;
    expect_status(response, StatusCode::OK).await;
    let not_urgent = filtered(
        &state,
        "task",
        json!({ "property": "urgent", "op": "eq", "value": false }),
    )
    .await;
    assert_eq!(not_urgent.len(), 4);
    assert_eq!(
        get(&state, &format!("/api/data/task/{}", id(&done))).await["values"]["urgent"],
        false
    );
}

// C5-5
#[tokio::test]
async fn reference_list_filters_compare_with_one_item_or_several() {
    let (state, _dir) = app(true).await;
    let with_status = |wanted: &'static [&'static str]| {
        ids_where(move |person| wanted.contains(&person.text("status").unwrap()))
    };
    let filter = |op: &str, value: Value| json!({ "property": "status", "op": op, "value": value });

    assert_eq!(
        filtered(&state, PERSON, filter("eq", json!("pending"))).await,
        with_status(&["pending"])
    );
    assert_eq!(
        filtered(&state, PERSON, filter("in", json!(["pending", "inactive"]))).await,
        with_status(&["pending", "inactive"])
    );
    assert_eq!(
        filtered(&state, PERSON, filter("in", json!(["active"]))).await,
        with_status(&["active"])
    );
    // No item at all matches nothing.
    assert_eq!(
        filtered(&state, PERSON, filter("in", json!([]))).await,
        Vec::<String>::new()
    );

    let response = patch(&state, PERSON, "person-03", 1, json!({ "status": null })).await;
    expect_status(response, StatusCode::OK).await;
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "status", "op": "empty" })
        )
        .await,
        ["person-03"]
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "status", "op": "notEmpty" })
        )
        .await
        .len(),
        49
    );
}

// C5-5
#[tokio::test]
async fn reference_filters_compare_with_one_row_or_several() {
    let (state, _dir) = app(true).await;
    let in_organisations = |wanted: &'static [&'static str]| {
        ids_where(move |person| {
            person
                .text("organisation")
                .is_some_and(|id| wanted.contains(&id))
        })
    };
    let filter =
        |op: &str, value: Value| json!({ "property": "organisation", "op": op, "value": value });

    let one = in_organisations(&["organisation-3"]);
    assert!(!one.is_empty());
    assert_eq!(
        filtered(&state, PERSON, filter("eq", json!("organisation-3"))).await,
        one
    );
    let two = in_organisations(&["organisation-3", "organisation-7"]);
    assert!(two.len() > one.len());
    assert_eq!(
        filtered(
            &state,
            PERSON,
            filter("in", json!(["organisation-7", "organisation-3"]))
        )
        .await,
        two
    );
    // An id no row has is not an error: nothing refers to it.
    assert_eq!(
        filtered(&state, PERSON, filter("eq", json!("organisation-99"))).await,
        Vec::<String>::new()
    );
    assert_eq!(
        filtered(&state, PERSON, filter("in", json!([]))).await,
        Vec::<String>::new()
    );

    let without = ids_where(|person| person.values["organisation"].is_null());
    assert_eq!(without, ["person-13", "person-26", "person-39"]);
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "organisation", "op": "empty" })
        )
        .await,
        without
    );
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "organisation", "op": "notEmpty" })
        )
        .await
        .len(),
        PERSON_COUNT - without.len()
    );
}

// --- Choosing properties ---------------------------------------------------

#[tokio::test]
async fn select_returns_only_the_chosen_properties() {
    let (state, _dir) = app(true).await;
    let organisations = organisation_names(&state).await;

    // Asked for backwards, twice: the entity's own order, each once.
    let page = query(
        &state,
        PERSON,
        json!({ "select": ["organisation", "firstName", "organisation"], "pageSize": 200 }),
    )
    .await;
    assert_eq!(page["total"], 50);
    for (number, row) in (1..).zip(page["rows"].as_array().unwrap()) {
        let seeded = person_values(number);
        assert_eq!(
            row["values"],
            json!({ "firstName": seeded["firstName"], "organisation": seeded["organisation"] })
        );
        let keys: Vec<&String> = row["values"].as_object().unwrap().keys().collect();
        assert_eq!(keys, ["firstName", "organisation"]);
        // A reference comes with what it shows; one with no value has nothing to show.
        match seeded["organisation"].as_str() {
            Some(id) => assert_eq!(
                row["references"],
                json!({ "organisation": organisations[id] })
            ),
            None => assert_eq!(row["references"], json!({})),
        }
        // What stands for the row is there whatever was chosen.
        assert_eq!(row["display"], seeded["surname"]);
        assert_eq!(row["id"], person_id(number));
        assert_eq!(row["revision"], 1);
    }

    // Without the reference, no display value of it either.
    let page = query(&state, PERSON, json!({ "select": ["surname"] })).await;
    assert_eq!(page["rows"][0]["values"], json!({ "surname": "Smith" }));
    assert_eq!(page["rows"][0]["references"], json!({}));

    // Nothing chosen: only what every row has.
    let page = query(&state, PERSON, json!({ "select": [] })).await;
    assert_eq!(page["rows"][0]["values"], json!({}));
    assert_eq!(page["rows"][0]["display"], "Smith");

    // What is filtered, searched and sorted by need not be selected.
    let page = query(
        &state,
        PERSON,
        json!({
            "select": ["firstName"],
            "filter": [{ "property": "status", "op": "eq", "value": "pending" }],
            "search": "Pending",
            "sort": [{ "property": "organisation" }, { "property": "surname" }]
        }),
    )
    .await;
    assert_eq!(page["total"], 10);
    assert_eq!(
        page["rows"][0]["values"].as_object().unwrap().len(),
        1,
        "{page}"
    );
}

#[tokio::test]
async fn display_is_the_display_property_or_the_id_without_one() {
    let (state, _dir) = app(true).await;

    // Person is shown by its surname.
    let row = get(&state, "/api/data/person/person-06").await;
    assert_eq!(row["display"], "Van der Merwe");
    let response = patch(
        &state,
        PERSON,
        "person-06",
        1,
        json!({ "surname": "Renamed" }),
    )
    .await;
    assert_eq!(
        expect_status(response, StatusCode::OK).await["display"],
        "Renamed"
    );

    // An entity with no display property is shown by its id, and so is a
    // reference to one of its rows.
    create_entity(
        &state,
        json!({
            "name": "badge",
            "displayName": "Badge",
            "properties": [{ "name": "code", "displayName": "Code", "type": "text" }]
        }),
    )
    .await;
    let badge = create_row(&state, "badge", json!({ "code": "B-1" })).await;
    assert_eq!(badge["display"], badge["id"]);
    let page = query(&state, "badge", json!({ "select": [] })).await;
    assert_eq!(page["rows"][0]["display"], badge["id"]);

    create_entity(
        &state,
        json!({
            "name": "visit",
            "displayName": "Visit",
            "properties": [
                { "name": "badge", "displayName": "Badge", "type": "reference", "entity": "badge" },
                { "name": "host", "displayName": "Host", "type": "reference", "entity": "person" },
                { "name": "reason", "displayName": "Reason", "type": "text" }
            ],
            "displayProperty": "reason"
        }),
    )
    .await;
    let visit = create_row(
        &state,
        "visit",
        json!({ "badge": badge["id"], "host": "person-01" }),
    )
    .await;
    assert_eq!(
        visit["references"],
        json!({ "badge": badge["id"], "host": "Smith" })
    );
    // A row whose display property has no value is shown by its id too.
    assert_eq!(visit["display"], visit["id"]);

    // Searching does not look inside ids, so a badge's id finds nothing;
    // sorting by such a reference still works.
    let found = matching(&state, "visit", json!({ "search": badge["id"] })).await;
    assert_eq!(found, Vec::<String>::new());
    let found = matching(&state, "visit", json!({ "search": "smith" })).await;
    assert_eq!(found.len(), 1);
    let page = query(
        &state,
        "visit",
        json!({ "sort": [{ "property": "badge" }, { "property": "host", "direction": "desc" }] }),
    )
    .await;
    assert_eq!(page["total"], 1);
}

// --- Rows ------------------------------------------------------------------

#[tokio::test]
async fn creating_a_row_answers_201_with_a_new_id_at_revision_1() {
    let (state, _dir) = app(true).await;
    let values = json!({
        "firstName": "Zodwa",
        "surname": "Mkhize",
        "email": "zodwa@example.com",
        "dateOfBirth": "1991-03-14",
        "dependants": 2,
        "status": "active",
        "organisation": "organisation-4",
        "notes": "First line.\nSecond line."
    });

    let created = create_row(&state, PERSON, values.clone()).await;

    let id = created["id"].as_str().unwrap();
    assert!(is_row_id(id), "{id}");
    assert_eq!(created["revision"], 1);
    assert!(is_timestamp(created["createdAt"].as_str().unwrap()));
    assert_eq!(created["updatedAt"], created["createdAt"]);
    assert_eq!(created["display"], "Mkhize");
    assert_eq!(created["values"], values);
    assert_eq!(
        created["references"],
        json!({ "organisation": "Drakensberg Tours" })
    );

    assert_eq!(
        get(&state, &format!("/api/data/person/{id}")).await,
        created
    );
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 51);
    assert_eq!(get(&state, "/api/entities/person").await["rows"], 51);

    // Every row gets an id of its own.
    let other = create_row(&state, PERSON, values).await;
    assert_ne!(other["id"], created["id"]);
    assert!(is_row_id(other["id"].as_str().unwrap()));
}

#[tokio::test]
async fn a_row_cannot_choose_its_own_system_properties() {
    let (state, _dir) = app(true).await;

    for name in ["id", "revision", "createdAt", "updatedAt"] {
        let mut values = json!({ "firstName": "A", "surname": "B" });
        values[name] = json!("person-01");
        let error = invalid_row(&state, PERSON, &values).await;
        assert_eq!(paths(&error), [name]);
    }
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 50);
}

#[tokio::test]
async fn an_update_changes_only_what_was_sent_and_bumps_the_revision() {
    let (state, _dir) = app(true).await;
    let before = get(&state, "/api/data/person/person-02").await;
    tokio::time::sleep(Duration::from_millis(5)).await;

    let response = patch(
        &state,
        PERSON,
        "person-02",
        1,
        json!({ "surname": "Naidoo-Smith", "dependants": 4, "organisation": "organisation-1" }),
    )
    .await;
    let updated = expect_status(response, StatusCode::OK).await;

    let mut expected = before.clone();
    expected["revision"] = json!(2);
    expected["display"] = json!("Naidoo-Smith");
    expected["values"]["surname"] = json!("Naidoo-Smith");
    expected["values"]["dependants"] = json!(4);
    expected["values"]["organisation"] = json!("organisation-1");
    expected["references"]["organisation"] = json!("Acacia Logistics");
    expected["updatedAt"] = updated["updatedAt"].clone();
    assert_eq!(updated, expected);
    assert_eq!(updated["createdAt"], before["createdAt"]);
    assert!(updated["updatedAt"].as_str().unwrap() > before["updatedAt"].as_str().unwrap());
    assert_eq!(get(&state, "/api/data/person/person-02").await, updated);

    // Sending nothing still counts as a save; sending null clears.
    let response = patch(&state, PERSON, "person-02", 2, json!({})).await;
    let again = expect_status(response, StatusCode::OK).await;
    assert_eq!(again["revision"], 3);
    assert_eq!(again["values"], updated["values"]);

    let response = patch(
        &state,
        PERSON,
        "person-02",
        3,
        json!({ "organisation": null, "email": null }),
    )
    .await;
    let cleared = expect_status(response, StatusCode::OK).await;
    assert_eq!(cleared["revision"], 4);
    assert_eq!(cleared["values"]["organisation"], Value::Null);
    assert_eq!(cleared["values"]["email"], Value::Null);
    assert_eq!(cleared["references"], json!({}));
    assert_eq!(cleared["values"]["surname"], "Naidoo-Smith");

    // No other row was touched.
    assert_eq!(
        get(&state, "/api/data/person/person-01").await["revision"],
        1
    );
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 50);
}

// C5-8, the server's side
#[tokio::test]
async fn an_update_from_a_stale_revision_overwrites_nothing() {
    let (state, _dir) = app(true).await;

    // Two people open the same row; the first saves.
    let response = patch(
        &state,
        PERSON,
        "person-04",
        1,
        json!({ "surname": "First" }),
    )
    .await;
    let first = expect_status(response, StatusCode::OK).await;
    assert_eq!(first["revision"], 2);

    // The second saves from what they opened.
    let response = patch(
        &state,
        PERSON,
        "person-04",
        1,
        json!({ "surname": "Second", "email": "second@example.com" }),
    )
    .await;
    let error = expect_refused(response, StatusCode::CONFLICT, "revision_conflict").await;
    assert_eq!(
        error.error.message,
        "The row has changed since revision 1: it is now at revision 2. Load it again and reapply the change."
    );
    assert!(error.error.details.is_none());
    assert_eq!(get(&state, "/api/data/person/person-04").await, first);

    // A revision from the future is no better.
    let response = patch(
        &state,
        PERSON,
        "person-04",
        3,
        json!({ "surname": "Third" }),
    )
    .await;
    expect_refused(response, StatusCode::CONFLICT, "revision_conflict").await;
    assert_eq!(get(&state, "/api/data/person/person-04").await, first);

    // After loading again, the save goes through.
    let response = patch(
        &state,
        PERSON,
        "person-04",
        2,
        json!({ "surname": "Second" }),
    )
    .await;
    let second = expect_status(response, StatusCode::OK).await;
    assert_eq!(second["revision"], 3);
    assert_eq!(second["values"]["surname"], "Second");
    assert_eq!(second["values"]["email"], first["values"]["email"]);
}

#[tokio::test]
async fn deleting_a_row_answers_204_and_then_it_is_gone() {
    let (state, _dir) = app(true).await;

    no_content(&state, Method::DELETE, "/api/data/person/person-10").await;

    for method in [Method::GET, Method::DELETE] {
        let error = refused(
            &state,
            method,
            "/api/data/person/person-10",
            None,
            StatusCode::NOT_FOUND,
            "row_not_found",
        )
        .await;
        assert_eq!(
            error.error.message,
            "There is no Person with the id person-10."
        );
    }
    let response = patch(
        &state,
        PERSON,
        "person-10",
        1,
        json!({ "surname": "Ghost" }),
    )
    .await;
    expect_refused(response, StatusCode::NOT_FOUND, "row_not_found").await;

    let page = query(&state, PERSON, json!({ "pageSize": 200 })).await;
    assert_eq!(page["total"], 49);
    assert!(!ids(&page).contains(&"person-10"));
    assert_eq!(get(&state, "/api/entities/person").await["rows"], 49);
}

#[tokio::test]
async fn a_row_or_entity_that_is_not_there_is_a_404() {
    let (state, _dir) = app(true).await;
    let update = json!({ "revision": 1, "values": { "surname": "X" } });
    let create = json!({ "values": { "firstName": "A", "surname": "B" } });

    for id in [
        "nope",
        "person-51",
        "Person-01",
        "organisation-1",
        "x'%20OR%20'1'='1",
    ] {
        for (method, body) in [
            (Method::GET, None),
            (Method::PATCH, Some(&update)),
            (Method::DELETE, None),
        ] {
            refused(
                &state,
                method,
                &format!("/api/data/person/{id}"),
                body,
                StatusCode::NOT_FOUND,
                "row_not_found",
            )
            .await;
        }
    }

    for (method, uri, body) in [
        (Method::POST, "/api/data/planet/query", Some(json!({}))),
        (Method::POST, "/api/data/planet", Some(create.clone())),
        (Method::GET, "/api/data/planet/person-01", None),
        (
            Method::PATCH,
            "/api/data/planet/person-01",
            Some(update.clone()),
        ),
        (Method::DELETE, "/api/data/planet/person-01", None),
        // Names are exact, and a reference list is not an entity.
        (Method::POST, "/api/data/Person/query", Some(json!({}))),
        (
            Method::POST,
            "/api/data/personStatus/query",
            Some(json!({})),
        ),
    ] {
        refused(
            &state,
            method,
            uri,
            body.as_ref(),
            StatusCode::NOT_FOUND,
            "entity_not_found",
        )
        .await;
    }
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 50);
}

#[tokio::test]
async fn a_write_without_usable_values_is_an_invalid_request() {
    let (state, _dir) = app(true).await;
    let before = all_rows(&state, PERSON).await;

    for body in [
        json!({}),
        json!({ "values": null }),
        json!({ "values": "surname" }),
        json!({ "values": [{ "surname": "X" }] }),
        json!({ "values": 5 }),
        json!({ "firstName": "A", "surname": "B" }),
    ] {
        let error = refused(
            &state,
            Method::POST,
            "/api/data/person",
            Some(&body),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
        assert_eq!(
            error.error.message,
            "The request needs \"values\": an object of property names and their values.",
            "{body}"
        );

        let mut update = body.clone();
        update["revision"] = json!(1);
        refused(
            &state,
            Method::PATCH,
            "/api/data/person/person-01",
            Some(&update),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
    }

    // An update says which revision it was based on.
    for revision in [None, Some(json!("1")), Some(json!(-1)), Some(json!(1.5))] {
        let mut body = json!({ "values": { "surname": "X" } });
        if let Some(revision) = revision {
            body["revision"] = revision;
        }
        let error = refused(
            &state,
            Method::PATCH,
            "/api/data/person/person-01",
            Some(&body),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
        assert!(error.error.message.contains("\"revision\""), "{error:?}");
    }

    // A body that is not a JSON object at all.
    for body in [json!([]), json!("x"), json!(1), Value::Null] {
        for (method, uri) in [
            (Method::POST, "/api/data/person"),
            (Method::PATCH, "/api/data/person/person-01"),
            (Method::POST, "/api/data/person/query"),
        ] {
            refused(
                &state,
                method,
                uri,
                Some(&body),
                StatusCode::BAD_REQUEST,
                "invalid_request",
            )
            .await;
        }
    }
    for (method, uri) in [
        (Method::POST, "/api/data/person"),
        (Method::PATCH, "/api/data/person/person-01"),
        (Method::POST, "/api/data/person/query"),
    ] {
        let request = axum::http::Request::builder()
            .method(method)
            .uri(uri)
            .body(axum::body::Body::from("{ not json"))
            .unwrap();
        let response = tower::ServiceExt::oneshot(server::router(state.clone()), request)
            .await
            .unwrap();
        expect_refused(response, StatusCode::BAD_REQUEST, "invalid_request").await;
    }

    assert_eq!(all_rows(&state, PERSON).await, before);
}

#[tokio::test]
async fn values_are_stored_as_adr_0005_says() {
    let (state, _dir) = app(true).await;
    create_entity(
        &state,
        json!({
            "name": "reading",
            "displayName": "Reading",
            "properties": [
                { "name": "label", "displayName": "Label", "type": "text" },
                { "name": "whole", "displayName": "Whole", "type": "number", "whole": true },
                { "name": "decimal", "displayName": "Decimal", "type": "number" },
                { "name": "checked", "displayName": "Checked", "type": "boolean" },
                { "name": "day", "displayName": "Day", "type": "date" }
            ]
        }),
    )
    .await;

    // An empty string is no value.
    let empty = create_row(&state, "reading", json!({ "label": "" })).await;
    assert_eq!(empty["values"]["label"], Value::Null);
    assert_eq!(
        filtered(
            &state,
            "reading",
            json!({ "property": "label", "op": "empty" })
        )
        .await
        .len(),
        1
    );
    // Nothing sent: every property reads as no value, and yes/no as "no".
    assert_eq!(
        empty["values"],
        json!({ "label": null, "whole": null, "decimal": null, "checked": false, "day": null })
    );
    let id = empty["id"].as_str().unwrap();
    let response = patch(
        &state,
        "reading",
        id,
        1,
        json!({ "label": "x", "checked": true }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    let response = patch(
        &state,
        "reading",
        id,
        2,
        json!({ "label": "", "checked": null }),
    )
    .await;
    let cleared = expect_status(response, StatusCode::OK).await;
    assert_eq!(cleared["values"]["label"], Value::Null);
    assert_eq!(cleared["values"]["checked"], false);

    // Whole numbers come back without a fraction, however they were sent.
    let request = axum::http::Request::builder()
        .method(Method::POST)
        .uri("/api/data/reading")
        .body(axum::body::Body::from(
            r#"{ "values": { "whole": 3.0, "decimal": 2.0, "label": " kept as typed " } }"#,
        ))
        .unwrap();
    let response = tower::ServiceExt::oneshot(server::router(state.clone()), request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let bytes = http_body_util::BodyExt::collect(response.into_body())
        .await
        .unwrap()
        .to_bytes();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(text.contains(r#""whole":3,"#), "{text}");
    assert!(text.contains(r#""decimal":2,"#), "{text}");
    assert!(text.contains(r#""label":" kept as typed ""#), "{text}");

    let numbers = create_row(
        &state,
        "reading",
        json!({ "whole": -12, "decimal": 0.1, "checked": true, "day": "2024-02-29" }),
    )
    .await;
    assert_eq!(numbers["values"]["whole"].to_string(), "-12");
    assert_eq!(numbers["values"]["decimal"].to_string(), "0.1");
    assert_eq!(numbers["values"]["checked"], true);
    assert_eq!(numbers["values"]["day"], "2024-02-29");
    let large = create_row(
        &state,
        "reading",
        json!({ "whole": 9_007_199_254_740_991_i64, "decimal": -9_007_199_254_740_991_i64 }),
    )
    .await;
    assert_eq!(large["values"]["whole"].to_string(), "9007199254740991");
    assert_eq!(large["values"]["decimal"].to_string(), "-9007199254740991");
}

// --- Server validation -----------------------------------------------------

/// An entity with a property of every type, each with limits.
async fn create_measure(state: &AppState) {
    create_entity(
        state,
        json!({
            "name": "measure",
            "displayName": "Measure",
            "properties": [
                { "name": "title", "displayName": "Title", "type": "text", "required": true, "maxLength": 5 },
                { "name": "note", "displayName": "Note", "type": "text", "multiline": true },
                { "name": "amount", "displayName": "Amount", "type": "number", "min": -1.5, "max": 10 },
                { "name": "count", "displayName": "Count", "type": "number", "whole": true },
                { "name": "day", "displayName": "Day", "type": "date", "earliest": "2020-01-01", "latest": "2020-12-31" },
                { "name": "done", "displayName": "Done", "type": "boolean" },
                { "name": "status", "displayName": "Status", "type": "referenceList", "referenceList": "personStatus", "required": true },
                { "name": "organisation", "displayName": "Organisation", "type": "reference", "entity": "organisation" }
            ],
            "displayProperty": "title"
        }),
    )
    .await;
    // Inactive can no longer be chosen.
    let response = put_list(state, "personStatus", |definition| {
        definition["items"][2]["retired"] = json!(true);
    })
    .await;
    expect_status(response, StatusCode::OK).await;
}

/// The values of a measure the server accepts, to break one at a time.
fn sound_measure() -> Value {
    json!({ "title": "ok", "status": "active" })
}

#[tokio::test]
async fn every_value_is_checked_against_its_property() {
    let (state, _dir) = app(true).await;
    create_measure(&state).await;
    let created = create_row(&state, "measure", sound_measure()).await;
    let id = created["id"].as_str().unwrap().to_owned();

    let cases: Vec<(&str, Value, &str)> = vec![
        // Text
        ("title", json!(5), "Enter text"),
        ("title", json!(true), "Enter text"),
        ("title", json!(["a"]), "Enter text"),
        ("title", json!({ "a": 1 }), "Enter text"),
        ("title", Value::Null, "This field is required"),
        ("title", json!(""), "This field is required"),
        ("title", json!("   "), "This field is required"),
        ("title", json!("abcdef"), "Enter no more than 5 characters"),
        ("title", json!("éééééé"), "Enter no more than 5 characters"),
        ("title", json!("a\nb"), "Enter a single line of text"),
        ("title", json!("a\rb"), "Enter a single line of text"),
        ("note", json!(1.5), "Enter text"),
        // Number
        ("amount", json!("5"), "Enter a number"),
        ("amount", json!(true), "Enter a number"),
        ("amount", json!([5]), "Enter a number"),
        ("amount", json!(-1.6), "Enter a number that is -1.5 or more"),
        ("amount", json!(10.01), "Enter a number that is 10 or less"),
        ("amount", json!(1e16), "That number is too large"),
        ("count", json!(2.5), "Enter a whole number"),
        ("count", json!(-9.1e15), "That number is too large"),
        ("count", json!("three"), "Enter a number"),
        // Date
        ("day", json!("2020-02-30"), "Enter a date as YYYY-MM-DD"),
        ("day", json!("01/02/2020"), "Enter a date as YYYY-MM-DD"),
        (
            "day",
            json!("2020-06-01T00:00:00Z"),
            "Enter a date as YYYY-MM-DD",
        ),
        ("day", json!(""), "Enter a date as YYYY-MM-DD"),
        ("day", json!(20_200_601), "Enter a date as YYYY-MM-DD"),
        (
            "day",
            json!("2019-12-31"),
            "Enter a date on or after 2020-01-01",
        ),
        (
            "day",
            json!("2021-01-01"),
            "Enter a date on or before 2020-12-31",
        ),
        // Yes/no
        ("done", json!("yes"), "Choose yes or no"),
        ("done", json!(1), "Choose yes or no"),
        // Reference list
        (
            "status",
            json!("coal"),
            "Person status has no item \"coal\"",
        ),
        (
            "status",
            json!("Active"),
            "Person status has no item \"Active\"",
        ),
        ("status", json!(""), "Person status has no item \"\""),
        ("status", json!(1), "Choose one of the list's items"),
        ("status", Value::Null, "This field is required"),
        (
            "status",
            json!("inactive"),
            "Inactive is retired and can no longer be chosen",
        ),
        // Reference
        (
            "organisation",
            json!("organisation-99"),
            "There is no Organisation with that id",
        ),
        (
            "organisation",
            json!("person-01"),
            "There is no Organisation with that id",
        ),
        ("organisation", json!(1), "Choose a row by its id"),
        ("organisation", json!(""), "Choose a row by its id"),
        (
            "organisation",
            json!({ "id": "organisation-1" }),
            "Choose a row by its id",
        ),
        // Not a property at all
        (
            "nope",
            json!("x"),
            "Measure has no property named \"nope\".",
        ),
        (
            "Title",
            json!("x"),
            "Measure has no property named \"Title\".",
        ),
    ];
    for (name, value, message) in &cases {
        // On a new row...
        let mut values = sound_measure();
        values[*name] = value.clone();
        let error = invalid_row(&state, "measure", &values).await;
        assert_eq!(paths(&error), [*name], "create {name} = {value}");
        assert_eq!(
            message_at(&error, name),
            *message,
            "create {name} = {value}"
        );
        assert_eq!(error.error.message, "The row has 1 problem.");

        // ...and on a row that exists, sent by itself.
        let response = patch(&state, "measure", &id, 1, json!({ *name: value })).await;
        let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_row").await;
        assert_eq!(paths(&error), [*name], "update {name} = {value}");
        assert_eq!(
            message_at(&error, name),
            *message,
            "update {name} = {value}"
        );
    }

    // Nothing was stored or changed.
    assert_eq!(all_rows(&state, "measure").await, [created]);
}

#[tokio::test]
async fn values_at_their_limits_are_accepted() {
    let (state, _dir) = app(true).await;
    create_measure(&state).await;

    let cases = [
        // Five characters, ten bytes: length is counted in characters.
        json!({ "title": "ééééé" }),
        json!({ "title": "日本語の字" }),
        json!({ "note": "several\nlines\r\nhere" }),
        json!({ "amount": -1.5 }),
        json!({ "amount": 10 }),
        json!({ "count": 9_007_199_254_740_991_i64 }),
        json!({ "count": 0 }),
        json!({ "day": "2020-01-01" }),
        json!({ "day": "2020-12-31" }),
        json!({ "day": "2020-02-29" }),
        json!({ "done": true }),
        json!({ "status": "pending" }),
        json!({ "organisation": "organisation-8" }),
        // No value where none is required.
        json!({ "note": null, "amount": null, "count": null, "day": null, "done": null, "organisation": null }),
    ];
    for change in cases {
        let mut values = sound_measure();
        for (name, value) in change.as_object().unwrap() {
            values[name] = value.clone();
        }
        let created = create_row(&state, "measure", values.clone()).await;
        for (name, value) in change.as_object().unwrap() {
            let expected = if name == "done" && value.is_null() {
                &json!(false)
            } else {
                value
            };
            assert_eq!(&created["values"][name], expected, "{change}");
        }
    }
}

#[tokio::test]
async fn every_problem_of_a_row_is_listed_at_once() {
    let (state, _dir) = app(true).await;
    create_measure(&state).await;
    let values = json!({
        "bogus": 1,
        "title": "much too long",
        "note": 7,
        "amount": 11,
        "count": 0.5,
        "day": "yesterday",
        "done": "no",
        "status": "inactive",
        "organisation": "organisation-0"
    });

    let error = invalid_row(&state, "measure", &values).await;
    // Unknown names first, then the entity's own order.
    assert_eq!(
        paths(&error),
        [
            "bogus",
            "title",
            "note",
            "amount",
            "count",
            "day",
            "done",
            "status",
            "organisation"
        ]
    );
    assert_eq!(error.error.message, "The row has 9 problems.");
    assert_eq!(query(&state, "measure", json!({})).await["total"], 0);

    // The same on an update; a stale revision does not hide them.
    let created = create_row(&state, "measure", sound_measure()).await;
    let id = created["id"].as_str().unwrap();
    for revision in [1, 7] {
        let response = patch(&state, "measure", id, revision, values.clone()).await;
        let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_row").await;
        assert_eq!(error.error.details.unwrap().len(), 9);
    }
    assert_eq!(
        get(&state, &format!("/api/data/measure/{id}")).await,
        created
    );
}

#[tokio::test]
async fn an_update_checks_only_what_it_changes() {
    let (state, _dir) = app(true).await;
    create_measure(&state).await;
    let created = create_row(
        &state,
        "measure",
        json!({ "title": "ok", "status": "active", "amount": 5, "organisation": "organisation-2" }),
    )
    .await;
    let id = created["id"].as_str().unwrap();

    // Required properties that are not sent keep their values.
    let response = patch(&state, "measure", id, 1, json!({ "note": "fine" })).await;
    let saved = expect_status(response, StatusCode::OK).await;
    assert_eq!(saved["values"]["title"], "ok");
    assert_eq!(saved["values"]["status"], "active");

    // Tighten the limits under the row: what it holds is not sent, so the
    // save of something else still goes through.
    let response = support::put_entity(&state, "measure", |definition| {
        support::property(definition, "note")["required"] = json!(true);
    })
    .await;
    expect_status(response, StatusCode::OK).await;
    let other = create_row(
        &state,
        "measure",
        json!({ "title": "two", "status": "active", "note": "n" }),
    )
    .await;
    assert_eq!(other["values"]["note"], "n");
    let response = patch(&state, "measure", id, 2, json!({ "note": null })).await;
    let error = expect_refused(response, StatusCode::BAD_REQUEST, "invalid_row").await;
    assert_eq!(paths(&error), ["note"]);
    assert_eq!(message_at(&error, "note"), "This field is required");
}

// --- Rows that are referred to ---------------------------------------------

// C5-10, the server's side
#[tokio::test]
async fn an_organisation_people_refer_to_cannot_be_deleted() {
    let (state, _dir) = app(true).await;
    let members = ids_where(|person| person.text("organisation") == Some("organisation-1"));
    assert!(members.len() > 1);

    let error = refused(
        &state,
        Method::DELETE,
        "/api/data/organisation/organisation-1",
        None,
        StatusCode::CONFLICT,
        "row_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        format!(
            "Acacia Logistics cannot be deleted: {} rows of Person refer to it as Organisation. Change or delete those rows first.",
            members.len()
        )
    );
    // It and the people who refer to it are as they were.
    let organisation = get(&state, "/api/data/organisation/organisation-1").await;
    assert_eq!(organisation["revision"], 1);
    assert_eq!(organisation["values"]["name"], "Acacia Logistics");
    assert_eq!(
        filtered(
            &state,
            PERSON,
            json!({ "property": "organisation", "op": "eq", "value": "organisation-1" })
        )
        .await,
        members
    );

    // A person is referred to by nothing.
    no_content(&state, Method::DELETE, "/api/data/person/person-01").await;
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 49);
    assert_eq!(query(&state, ORGANISATION, json!({})).await["total"], 8);

    // An organisation nobody refers to can go.
    let spare = create_row(&state, ORGANISATION, json!({ "name": "Ninth Wave" })).await;
    let spare_uri = format!("/api/data/organisation/{}", spare["id"].as_str().unwrap());
    no_content(&state, Method::DELETE, &spare_uri).await;
    refused(
        &state,
        Method::GET,
        &spare_uri,
        None,
        StatusCode::NOT_FOUND,
        "row_not_found",
    )
    .await;

    // One referred to by a single row says so in the singular.
    let single = create_row(&state, ORGANISATION, json!({ "name": "Solo Works" })).await;
    let single_id = single["id"].as_str().unwrap();
    let response = patch(
        &state,
        PERSON,
        "person-02",
        1,
        json!({ "organisation": single_id }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    let single_uri = format!("/api/data/organisation/{single_id}");
    let error = refused(
        &state,
        Method::DELETE,
        &single_uri,
        None,
        StatusCode::CONFLICT,
        "row_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        "Solo Works cannot be deleted: 1 row of Person refers to it as Organisation. Change or delete that row first."
    );

    // Once the last reference moves away, or its row is deleted, it can go.
    no_content(&state, Method::DELETE, "/api/data/person/person-02").await;
    no_content(&state, Method::DELETE, &single_uri).await;
    for member in &members {
        if member == "person-01" {
            continue;
        }
        let response = patch(&state, PERSON, member, 1, json!({ "organisation": null })).await;
        expect_status(response, StatusCode::OK).await;
    }
    no_content(
        &state,
        Method::DELETE,
        "/api/data/organisation/organisation-1",
    )
    .await;
    assert_eq!(query(&state, ORGANISATION, json!({})).await["total"], 7);
}

#[tokio::test]
async fn every_reference_to_a_row_is_named_when_its_delete_is_refused() {
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
    let spare = create_row(&state, ORGANISATION, json!({ "name": "Ninth Wave" })).await;
    let id = spare["id"].as_str().unwrap();
    create_row(&state, "contract", json!({ "client": id, "supplier": id })).await;
    create_row(&state, "contract", json!({ "client": id })).await;

    let error = refused(
        &state,
        Method::DELETE,
        &format!("/api/data/organisation/{id}"),
        None,
        StatusCode::CONFLICT,
        "row_in_use",
    )
    .await;
    assert_eq!(
        error.error.message,
        "Ninth Wave cannot be deleted: 2 rows of Contract refer to it as Client, and 1 row of Contract refers to it as Supplier. Change or delete those rows first."
    );
}

// --- Bad queries -----------------------------------------------------------

// C5-18
#[tokio::test]
async fn sorting_by_what_is_not_a_property_is_a_400_with_the_place() {
    let (state, _dir) = app(true).await;

    let error = bad_query(&state, &json!({ "sort": [{ "property": "nickname" }] })).await;
    assert_eq!(paths(&error), ["sort[0].property"]);
    assert_eq!(
        message_at(&error, "sort[0].property"),
        "Person has no property named \"nickname\"."
    );
    assert_eq!(error.error.message, "The query has 1 problem.");

    let cases = [
        (
            json!([{ "property": "surname" }, { "property": "Surname" }]),
            "sort[1].property",
        ),
        (json!([{ "property": "" }]), "sort[0].property"),
        (json!([{ "property": "revision" }]), "sort[0].property"),
        (json!([{ "property": "created_at" }]), "sort[0].property"),
        (json!([{ "property": "c1" }]), "sort[0].property"),
        (
            json!([{ "property": "organisation.name" }]),
            "sort[0].property",
        ),
        (
            json!([{ "property": "surname", "direction": "up" }]),
            "sort[0].direction",
        ),
        (
            json!([{ "property": "surname", "direction": "ASC" }]),
            "sort[0].direction",
        ),
        (json!([{ "direction": "asc" }]), "sort[0]"),
        (json!([{ "property": 5 }]), "sort[0].property"),
        (json!(["surname"]), "sort[0]"),
        (json!("surname"), "sort"),
        (json!({ "property": "surname" }), "sort"),
        (
            json!([{ "property": "surname", "nulls": "last" }]),
            "sort[0].nulls",
        ),
    ];
    for (sort, path) in cases {
        let error = bad_query(&state, &json!({ "sort": sort })).await;
        assert_eq!(paths(&error), [path], "{sort}");
    }

    // At most eight sort keys.
    let nine: Vec<Value> = (0..9).map(|_| json!({ "property": "surname" })).collect();
    let error = bad_query(&state, &json!({ "sort": nine })).await;
    assert_eq!(paths(&error), ["sort"]);
    let eight: Vec<Value> = (0..8).map(|_| json!({ "property": "surname" })).collect();
    query(&state, PERSON, json!({ "sort": eight })).await;
}

// C5-18
#[tokio::test]
async fn a_malformed_filter_is_a_400_with_the_place() {
    let (state, _dir) = app(true).await;
    let filter = |property: &str, op: &str, value: Value| json!({ "property": property, "op": op, "value": value });

    let cases: Vec<(&str, Value, &str)> = vec![
        (
            "an unknown property",
            json!([filter("nickname", "eq", json!("x"))]),
            "filter[0].property",
        ),
        (
            "a system property",
            json!([filter("id", "eq", json!("person-01"))]),
            "filter[0].property",
        ),
        (
            "the second of two",
            json!([
                filter("surname", "eq", json!("x")),
                filter("nope", "eq", json!("x"))
            ]),
            "filter[1].property",
        ),
        // Operators that do not apply to the type.
        (
            "gt on text",
            json!([filter("surname", "gt", json!("m"))]),
            "filter[0].op",
        ),
        (
            "in on text",
            json!([filter("surname", "in", json!(["a"]))]),
            "filter[0].op",
        ),
        (
            "contains on a number",
            json!([filter("dependants", "contains", json!(1))]),
            "filter[0].op",
        ),
        (
            "startsWith on a date",
            json!([filter("dateOfBirth", "startsWith", json!("19"))]),
            "filter[0].op",
        ),
        (
            "in on a date",
            json!([filter("dateOfBirth", "in", json!(["1990-01-01"]))]),
            "filter[0].op",
        ),
        (
            "contains on a reference list",
            json!([filter("status", "contains", json!("pend"))]),
            "filter[0].op",
        ),
        (
            "gt on a reference list",
            json!([filter("status", "gt", json!("active"))]),
            "filter[0].op",
        ),
        (
            "contains on a reference",
            json!([filter("organisation", "contains", json!("Acacia"))]),
            "filter[0].op",
        ),
        (
            "lte on a reference",
            json!([filter("organisation", "lte", json!("organisation-1"))]),
            "filter[0].op",
        ),
        // Values of the wrong type.
        (
            "a number for text",
            json!([filter("surname", "eq", json!(5))]),
            "filter[0].value",
        ),
        (
            "a list for text",
            json!([filter("surname", "contains", json!(["smi"]))]),
            "filter[0].value",
        ),
        (
            "text for a number",
            json!([filter("dependants", "eq", json!("2"))]),
            "filter[0].value",
        ),
        (
            "true for a number",
            json!([filter("dependants", "gte", json!(true))]),
            "filter[0].value",
        ),
        (
            "a day that does not exist",
            json!([filter("dateOfBirth", "gte", json!("1990-02-30"))]),
            "filter[0].value",
        ),
        (
            "words for a date",
            json!([filter("dateOfBirth", "lt", json!("yesterday"))]),
            "filter[0].value",
        ),
        (
            "a number for a date",
            json!([filter("dateOfBirth", "eq", json!(1990))]),
            "filter[0].value",
        ),
        (
            "an unknown item",
            json!([filter("status", "eq", json!("coal"))]),
            "filter[0].value",
        ),
        (
            "an unknown item among known ones",
            json!([filter("status", "in", json!(["active", "coal"]))]),
            "filter[0].value",
        ),
        (
            "one value for in",
            json!([filter("status", "in", json!("active"))]),
            "filter[0].value",
        ),
        (
            "a list for eq",
            json!([filter("status", "eq", json!(["active"]))]),
            "filter[0].value",
        ),
        (
            "numbers in a list",
            json!([filter("organisation", "in", json!(["organisation-1", 2]))]),
            "filter[0].value",
        ),
        (
            "a number for a reference",
            json!([filter("organisation", "eq", json!(1))]),
            "filter[0].value",
        ),
        // A value that is needed and missing.
        (
            "no value for eq",
            json!([{ "property": "surname", "op": "eq" }]),
            "filter[0].value",
        ),
        (
            "null for eq",
            json!([{ "property": "surname", "op": "eq", "value": null }]),
            "filter[0].value",
        ),
        (
            "no value for gte",
            json!([{ "property": "dependants", "op": "gte" }]),
            "filter[0].value",
        ),
        (
            "no value for in",
            json!([{ "property": "status", "op": "in" }]),
            "filter[0].value",
        ),
        // The wrong shape.
        (
            "not a list",
            json!({ "property": "surname", "op": "eq", "value": "x" }),
            "filter",
        ),
        ("text", json!("surname eq 'Smith'"), "filter"),
        ("a list of text", json!(["surname"]), "filter[0]"),
        (
            "an unknown operator",
            json!([filter("surname", "like", json!("%"))]),
            "filter[0].op",
        ),
        (
            "an operator in the wrong case",
            json!([filter("surname", "EQ", json!("x"))]),
            "filter[0].op",
        ),
        (
            "an operator that is not text",
            json!([filter("surname", "eq", json!("x")), { "property": "surname", "op": 1 }]),
            "filter[1].op",
        ),
        (
            "no operator",
            json!([{ "property": "surname", "value": "x" }]),
            "filter[0]",
        ),
        (
            "no property",
            json!([{ "op": "eq", "value": "x" }]),
            "filter[0]",
        ),
        (
            "an unknown key",
            json!([{ "property": "surname", "op": "eq", "value": "x", "not": true }]),
            "filter[0].not",
        ),
    ];
    for (case, filter, path) in cases {
        let error = bad_query(&state, &json!({ "filter": filter })).await;
        assert_eq!(paths(&error), [path], "{case}: {error:?}");
        let message = message_at(&error, path);
        assert!(
            message.ends_with('.') && message.len() > 10,
            "{case}: {message}"
        );
    }

    let error = bad_query(
        &state,
        &json!({ "filter": [filter("surname", "gt", json!("m"))] }),
    )
    .await;
    assert_eq!(
        message_at(&error, "filter[0].op"),
        "\"gt\" does not apply to Surname, a text property. Use one of: eq, contains, startsWith, empty, notEmpty."
    );
    let error = bad_query(
        &state,
        &json!({ "filter": [filter("dependants", "eq", json!("2"))] }),
    )
    .await;
    assert_eq!(
        message_at(&error, "filter[0].value"),
        "Dependants is compared with a number."
    );
    let error = bad_query(
        &state,
        &json!({ "filter": [{ "property": "surname", "op": "eq" }] }),
    )
    .await;
    assert_eq!(
        message_at(&error, "filter[0].value"),
        "\"eq\" needs a value to compare with."
    );

    // At most fifty filters.
    let many = |count: usize| -> Vec<Value> {
        (0..count)
            .map(|_| json!({ "property": "surname", "op": "notEmpty" }))
            .collect()
    };
    let error = bad_query(&state, &json!({ "filter": many(51) })).await;
    assert_eq!(paths(&error), ["filter"]);
    assert_eq!(
        query(&state, PERSON, json!({ "filter": many(50) })).await["total"],
        50
    );
}

// C5-18
#[tokio::test]
async fn a_bad_page_or_page_size_is_a_400_with_the_place() {
    let (state, _dir) = app(true).await;

    let cases = [
        (json!({ "page": 0 }), "page"),
        (json!({ "page": -1 }), "page"),
        (json!({ "page": 1.5 }), "page"),
        (json!({ "page": "2" }), "page"),
        (json!({ "page": "next" }), "page"),
        (json!({ "page": [1] }), "page"),
        (json!({ "page": 4_294_967_296_u64 }), "page"),
        (json!({ "pageSize": 0 }), "pageSize"),
        (json!({ "pageSize": 201 }), "pageSize"),
        (json!({ "pageSize": -10 }), "pageSize"),
        (json!({ "pageSize": "ten" }), "pageSize"),
        (json!({ "pageSize": 2.5 }), "pageSize"),
        (json!({ "pageSize": true }), "pageSize"),
        (json!({ "pageSize": 1_000_000 }), "pageSize"),
    ];
    for (body, path) in cases {
        let error = bad_query(&state, &body).await;
        assert_eq!(paths(&error), [path], "{body}");
    }
    let error = bad_query(&state, &json!({ "page": 0, "pageSize": 201 })).await;
    assert_eq!(paths(&error), ["page", "pageSize"]);
    assert_eq!(message_at(&error, "page"), "Pages are numbered from 1.");
    assert_eq!(
        message_at(&error, "pageSize"),
        "The page size is from 1 to 200."
    );

    // The edges are fine.
    let page = query(&state, PERSON, json!({ "page": 1, "pageSize": 1 })).await;
    assert_eq!(ids(&page), ["person-01"]);
    let page = query(&state, PERSON, json!({ "page": 50, "pageSize": 1 })).await;
    assert_eq!(ids(&page), ["person-50"]);
    let page = query(&state, PERSON, json!({ "pageSize": 200 })).await;
    assert_eq!(page["rows"].as_array().unwrap().len(), 50);
}

// C5-18
#[tokio::test]
async fn a_query_of_the_wrong_shape_is_a_400_with_the_place() {
    let (state, _dir) = app(true).await;

    let cases = [
        (json!({ "order": "surname" }), "order"),
        (json!({ "where": "1=1" }), "where"),
        (json!({ "page_size": 10 }), "page_size"),
        (json!({ "select": "surname" }), "select"),
        (json!({ "select": ["surname", 5] }), "select[1]"),
        (json!({ "select": ["nickname"] }), "select[0]"),
        (json!({ "select": ["surname", "id"] }), "select[1]"),
        (json!({ "search": 5 }), "search"),
        (json!({ "search": ["smi"] }), "search"),
        (json!({ "search": { "text": "smi" } }), "search"),
        (json!({ "search": "x".repeat(201) }), "search"),
        (json!({ "search": "é".repeat(201) }), "search"),
    ];
    for (body, path) in cases {
        let error = bad_query(&state, &body).await;
        assert_eq!(paths(&error), [path], "{body}");
        assert!(message_at(&error, path).ends_with('.'));
    }
    let error = bad_query(&state, &json!({ "search": "x".repeat(201) })).await;
    assert_eq!(
        message_at(&error, "search"),
        "The search text is 201 characters long; the limit is 200."
    );
    // 200 characters, of two bytes each, is a search like any other.
    let page = query(&state, PERSON, json!({ "search": "é".repeat(200) })).await;
    assert_eq!(page["total"], 0);

    // A body that is not an object cannot be read as a query at all.
    for body in [json!([]), json!("surname"), json!(25), Value::Null] {
        refused(
            &state,
            Method::POST,
            "/api/data/person/query",
            Some(&body),
            StatusCode::BAD_REQUEST,
            "invalid_request",
        )
        .await;
    }

    // Everything wrong with a well-formed query is listed at once.
    let error = bad_query(
        &state,
        &json!({
            "select": ["surname", "nope"],
            "filter": [
                { "property": "surname", "op": "gt", "value": "m" },
                { "property": "status", "op": "eq", "value": "pending" },
                { "property": "dependants", "op": "eq", "value": "two" },
                { "property": "ghost", "op": "empty" }
            ],
            "search": "x".repeat(300),
            "sort": [{ "property": "surname" }, { "property": "ghost" }],
            "page": 0,
            "pageSize": 500
        }),
    )
    .await;
    assert_eq!(
        paths(&error),
        [
            "select[1]",
            "filter[0].op",
            "filter[2].value",
            "filter[3].property",
            "search",
            "sort[1].property",
            "page",
            "pageSize"
        ]
    );
    assert_eq!(error.error.message, "The query has 8 problems.");
}

const SQL_LIKE: [&str; 8] = [
    "surname; DROP TABLE entity_2; --",
    "surname' OR '1'='1",
    "1; DELETE FROM forms",
    "c1",
    "t.c1",
    "surname COLLATE NOCASE DESC, (SELECT definition FROM entities)",
    "\"surname\"",
    "surname--",
];

// C5-18
#[tokio::test]
async fn sql_like_text_where_a_property_is_named_is_a_400_and_touches_nothing() {
    let (state, _dir) = app(true).await;
    let tables_before = tables(&state).await;
    let rows_before = all_rows(&state, PERSON).await;

    for attack in SQL_LIKE {
        let error = bad_query(&state, &json!({ "sort": [{ "property": attack }] })).await;
        assert_eq!(paths(&error), ["sort[0].property"], "{attack}");

        let error = bad_query(
            &state,
            &json!({ "filter": [{ "property": attack, "op": "eq", "value": "x" }] }),
        )
        .await;
        assert_eq!(paths(&error), ["filter[0].property"], "{attack}");

        let error = bad_query(&state, &json!({ "select": ["surname", attack] })).await;
        assert_eq!(paths(&error), ["select[1]"], "{attack}");

        let error = bad_query(
            &state,
            &json!({ "sort": [{ "property": "surname", "direction": attack }] }),
        )
        .await;
        assert_eq!(paths(&error), ["sort[0].direction"], "{attack}");

        let error = bad_query(
            &state,
            &json!({ "filter": [{ "property": "surname", "op": attack, "value": "x" }] }),
        )
        .await;
        assert_eq!(paths(&error), ["filter[0].op"], "{attack}");

        // As a property of a row it is just a name the entity does not have.
        let error = invalid_row(
            &state,
            PERSON,
            &json!({ "firstName": "A", "surname": "B", attack: "x" }),
        )
        .await;
        assert_eq!(paths(&error), [attack]);
    }

    assert_eq!(tables(&state).await, tables_before);
    assert_eq!(all_rows(&state, PERSON).await, rows_before);
    assert_eq!(
        get(&state, "/api/forms").await["forms"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
}

// C5-18. Search text is only ever a bound parameter. Text that reads as SQL
// (statement or comment markers, control characters) is refused with a 400 at
// `search`; other odd text, quotes included, is a search that finds nothing.
// An apostrophe is something people really search for (O'Brien).
#[tokio::test]
async fn sql_like_search_text_is_refused_and_quotes_are_only_text() {
    let (state, _dir) = app(true).await;
    let tables_before = tables(&state).await;
    let rows_before = all_rows(&state, PERSON).await;
    let organisations_before = all_rows(&state, ORGANISATION).await;

    let attacks = [
        "'; DROP TABLE entity_1; --",
        "'; DROP TABLE entity_2; --",
        "%' OR 1=1 --",
        "' OR '1'='1",
        "\" OR \"\"=\"",
        "x') OR 1=1; DELETE FROM forms; --",
        "'; UPDATE entity_2 SET c2 = 'pwned'; --",
        "\\' ESCAPE '\\",
        "' UNION SELECT definition FROM entities --",
        "\0",
    ];
    for attack in attacks {
        let reads_as_sql =
            attack.contains(';') || attack.contains("--") || attack.chars().any(char::is_control);
        if reads_as_sql {
            let error = refused(
                &state,
                Method::POST,
                "/api/data/person/query",
                Some(&json!({ "search": attack })),
                StatusCode::BAD_REQUEST,
                "invalid_query",
            )
            .await;
            assert_eq!(paths(&error), ["search"], "{attack}");
        } else {
            let page = query(&state, PERSON, json!({ "search": attack })).await;
            assert_eq!(page["total"], 0, "{attack}");
            assert_eq!(page["rows"], json!([]), "{attack}");
        }

        // The same text as a value to compare with is only a value.
        for filter in [
            json!({ "property": "surname", "op": "eq", "value": attack }),
            json!({ "property": "surname", "op": "contains", "value": attack }),
            json!({ "property": "surname", "op": "startsWith", "value": attack }),
            json!({ "property": "organisation", "op": "eq", "value": attack }),
            json!({ "property": "organisation", "op": "in", "value": [attack, attack] }),
        ] {
            let page = query(&state, PERSON, json!({ "filter": [filter] })).await;
            assert_eq!(page["total"], 0, "{attack}");
        }
    }

    // Every table and every row is still there, unchanged.
    assert_eq!(tables(&state).await, tables_before);
    assert_eq!(all_rows(&state, PERSON).await, rows_before);
    assert_eq!(rows_before.len(), 50);
    assert_eq!(all_rows(&state, ORGANISATION).await, organisations_before);
    assert_eq!(
        get(&state, "/api/forms").await["forms"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        get(&state, "/api/entities").await["entities"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

// C5-18
#[tokio::test]
async fn sql_like_text_is_stored_and_found_as_the_text_it_is() {
    let (state, _dir) = app(true).await;
    let tables_before = tables(&state).await;

    // A surname with an apostrophe is stored and found by searching for it.
    let obrien = create_row(
        &state,
        PERSON,
        json!({ "firstName": "Siobhan", "surname": "O'Brien", "notes": "Says \"hello\"; -- often" }),
    )
    .await;
    let id = obrien["id"].as_str().unwrap().to_owned();
    assert_eq!(obrien["values"]["surname"], "O'Brien");
    assert_eq!(obrien["display"], "O'Brien");
    assert_eq!(get(&state, &format!("/api/data/person/{id}")).await, obrien);
    for search in ["O'Brien", "o'brien", "o'b", "'", "\"hello\""] {
        let found = matching(&state, PERSON, json!({ "search": search })).await;
        assert_eq!(found, std::slice::from_ref(&id), "{search:?}");
    }
    for (op, value) in [("eq", "o'brien"), ("contains", "'"), ("startsWith", "O'")] {
        let filter = json!({ "property": "surname", "op": op, "value": value });
        assert_eq!(
            filtered(&state, PERSON, filter).await,
            std::slice::from_ref(&id),
            "{op}"
        );
    }

    // A value that looks like SQL is kept to the letter.
    let attack = "Robert'); DROP TABLE entity_2; --";
    let bobby = create_row(
        &state,
        PERSON,
        json!({ "firstName": "Bobby", "surname": attack }),
    )
    .await;
    assert_eq!(bobby["values"]["surname"], attack);
    let found = matching(&state, PERSON, json!({ "search": "Robert')" })).await;
    assert_eq!(found, [bobby["id"].as_str().unwrap()]);
    let response = patch(
        &state,
        PERSON,
        bobby["id"].as_str().unwrap(),
        1,
        json!({ "notes": "'; DELETE FROM entity_2; --" }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;

    // And as an organisation's name it is what a reference shows and what
    // search finds people by.
    let response = patch(
        &state,
        ORGANISATION,
        "organisation-5",
        1,
        json!({ "name": "Ekhaya's \"Homes\" %_" }),
    )
    .await;
    expect_status(response, StatusCode::OK).await;
    let members = ids_where(|person| person.text("organisation") == Some("organisation-5"));
    let found = matching(&state, PERSON, json!({ "search": "ekhaya's \"homes\" %_" })).await;
    assert_eq!(found, members);

    assert_eq!(tables(&state).await, tables_before);
    assert_eq!(query(&state, PERSON, json!({})).await["total"], 52);
}

// --- Performance -----------------------------------------------------------

const TICKETS: usize = 10_000;
const COMPANIES: usize = 20;
const STAGES: [(&str, &str); 3] = [
    ("open", "Open"),
    ("waiting", "Waiting"),
    ("closed", "Closed"),
];

fn company_name(number: usize) -> String {
    match number % 5 {
        0 => format!("Alpha Works {number:02}"),
        1 => format!("Bravo Supplies {number:02}"),
        2 => format!("charlie & Sons {number:02}"),
        3 => format!("Delta Freight {number:02}"),
        _ => format!("Echo Labs {number:02}"),
    }
}

/// Ticket `index`, from 0: every value is worked out from the number.
fn ticket(index: usize) -> Value {
    let subject = [
        "Printer", "Invoice", "Login", "Delivery", "Refund", "Alphabet", "Laptop",
    ];
    let owner = ["Thandi", "Pieter", "Aisha", "Sipho", "Lerato", "Johan"];
    let company = if index.is_multiple_of(11) {
        Value::Null
    } else {
        json!(format!("company-{:02}", 1 + (index * 7) % COMPANIES))
    };
    json!({
        "title": format!("{} problem {index:05}", subject[index % subject.len()]),
        "description": if index.is_multiple_of(4) {
            Value::Null
        } else {
            json!(format!("Reported by phone.\nSee case {}.", index * 31 % 977))
        },
        "owner": owner[(index / 3) % owner.len()],
        "priority": (index * 13) % 5,
        "opened": format!("20{:02}-{:02}-{:02}", 20 + index % 6, 1 + (index * 5) % 12, 1 + (index * 17) % 28),
        "stage": STAGES[(index * 3 + index / 7) % 3].0,
        "company": company
    })
}

// C5-19
#[tokio::test]
async fn a_sorted_filtered_and_searched_page_of_10_000_rows_takes_under_200_ms() {
    let (state, _dir) = app(false).await;
    let items: Vec<Value> = STAGES
        .iter()
        .map(|(value, label)| json!({ "value": value, "label": label }))
        .collect();
    create_list(
        &state,
        json!({ "name": "stage", "displayName": "Stage", "items": items }),
    )
    .await;
    create_entity(
        &state,
        json!({
            "name": "company",
            "displayName": "Company",
            "properties": [{ "name": "name", "displayName": "Name", "type": "text", "required": true }],
            "displayProperty": "name"
        }),
    )
    .await;
    create_entity(
        &state,
        json!({
            "name": "ticket",
            "displayName": "Ticket",
            "properties": [
                { "name": "title", "displayName": "Title", "type": "text", "required": true, "maxLength": 100 },
                { "name": "description", "displayName": "Description", "type": "text", "multiline": true },
                { "name": "owner", "displayName": "Owner", "type": "text" },
                { "name": "priority", "displayName": "Priority", "type": "number", "whole": true, "min": 0, "max": 4 },
                { "name": "opened", "displayName": "Opened", "type": "date" },
                { "name": "stage", "displayName": "Stage", "type": "referenceList", "referenceList": "stage" },
                { "name": "company", "displayName": "Company", "type": "reference", "entity": "company" }
            ],
            "displayProperty": "title"
        }),
    )
    .await;

    // The rows go in through the same checks as the API, in one transaction.
    let loading = Instant::now();
    let mut tx = state.pool.begin().await.unwrap();
    let catalog = Catalog::load(&mut tx).await.unwrap();
    let companies = catalog.entity("company").unwrap();
    for number in 1..=COMPANIES {
        let values = json!({ "name": company_name(number) });
        let id = format!("company-{number:02}");
        server::data::rows::create(
            &mut tx,
            &catalog,
            companies,
            values.as_object().unwrap(),
            Some(&id),
        )
        .await
        .unwrap();
    }
    let tickets = catalog.entity("ticket").unwrap();
    for index in 0..TICKETS {
        let values = ticket(index);
        let id = format!("ticket-{index:05}");
        server::data::rows::create(
            &mut tx,
            &catalog,
            tickets,
            values.as_object().unwrap(),
            Some(&id),
        )
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
    println!("loaded {TICKETS} rows in {:?}", loading.elapsed());
    assert_eq!(get(&state, "/api/entities/ticket").await["rows"], TICKETS);

    // Sorted by a reference's display value and then by text, filtered on a
    // reference list, a number and a date, and searched: "alpha" is in some
    // titles ("Alphabet problem") and in some companies' names ("Alpha Works").
    let (search, from, page_size, page_number) = ("alpha", "2022-03-01", 25, 3);
    let body = json!({
        "select": ["title", "owner", "priority", "opened", "stage", "company"],
        "filter": [
            { "property": "stage", "op": "in", "value": ["open", "waiting"] },
            { "property": "priority", "op": "gte", "value": 2 },
            { "property": "opened", "op": "gte", "value": from }
        ],
        "search": search,
        "sort": [
            { "property": "company", "direction": "desc" },
            { "property": "title" }
        ],
        "page": page_number,
        "pageSize": page_size
    });

    // The same answer, worked out here.
    struct Expected {
        id: String,
        company: Option<String>,
        title: String,
    }
    let mut expected: Vec<Expected> = (0..TICKETS)
        .filter_map(|index| {
            let values = ticket(index);
            let company = values["company"].as_str().map(|id| {
                let number: usize = id.trim_start_matches("company-").parse().unwrap();
                company_name(number).to_lowercase()
            });
            let stage = values["stage"].as_str().unwrap();
            let label = STAGES.iter().find(|(value, _)| *value == stage).unwrap().1;
            let texts = [
                values["title"].as_str(),
                values["description"].as_str(),
                values["owner"].as_str(),
                Some(label),
                company.as_deref(),
            ];
            let found = texts
                .iter()
                .flatten()
                .any(|text| text.to_lowercase().contains(search));
            let kept = found
                && stage != "closed"
                && values["priority"].as_u64().unwrap() >= 2
                && values["opened"].as_str().unwrap() >= from;
            kept.then(|| Expected {
                id: format!("ticket-{index:05}"),
                company,
                title: values["title"].as_str().unwrap().to_lowercase(),
            })
        })
        .collect();
    expected.sort_by(|a, b| {
        b.company
            .cmp(&a.company)
            .then(a.title.cmp(&b.title))
            .then(a.id.cmp(&b.id))
    });
    // The query is worth timing: it keeps many rows, and drops many more.
    assert!(
        expected.len() > 300 && expected.len() < TICKETS / 2,
        "{}",
        expected.len()
    );
    let expected_page: Vec<&str> = expected
        .iter()
        .skip((page_number - 1) * page_size)
        .take(page_size)
        .map(|row| row.id.as_str())
        .collect();
    assert_eq!(expected_page.len(), page_size);

    // The best of three, so one slow moment on a busy machine does not fail it.
    let mut best = Duration::MAX;
    for _ in 0..3 {
        let started = Instant::now();
        let page = query(&state, "ticket", body.clone()).await;
        best = best.min(started.elapsed());

        assert_eq!(page["total"], expected.len());
        assert_eq!(page["page"], page_number);
        assert_eq!(page["pageSize"], page_size);
        assert_eq!(ids(&page), expected_page);
        let first = &page["rows"][0];
        assert_eq!(first["values"].as_object().unwrap().len(), 6);
        assert!(first["references"]["company"].is_string(), "{first}");
    }
    println!("a sorted, filtered and searched page of {TICKETS} rows: {best:?}");
    assert!(
        best < Duration::from_millis(200),
        "the query took {best:?}; the limit is 200 ms"
    );
}
