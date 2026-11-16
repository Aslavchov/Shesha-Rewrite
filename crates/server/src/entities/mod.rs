//! `/api/entities` and `/api/reference-lists`: the definitions an
//! administrator edits inside the app (ADR 0011). The rows are `crate::data`.

pub mod catalog;
pub mod schema;
pub mod seed;
pub mod validate;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use contracts::{
    EntityList, EntityRecord, ErrorDetail, ReferenceListDefinition, ReferenceListList,
    ReferenceListRecord,
};
use serde_json::{Map, Value};
use sqlx::SqliteConnection;

use crate::api::{based_on_revision, reading, request_object, writing};
use crate::error::AppError;
use crate::router::AppState;
use catalog::{Catalog, StoredEntity, StoredList};
use schema::{Change, rows};
use validate::Known;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities", get(list_entities).post(create_entity))
        .route(
            "/entities/{name}",
            get(read_entity).put(update_entity).delete(delete_entity),
        )
        .route("/reference-lists", get(list_lists).post(create_list))
        .route(
            "/reference-lists/{name}",
            get(read_list).put(update_list).delete(delete_list),
        )
}

// --- Entities --------------------------------------------------------------

async fn record(
    connection: &mut SqliteConnection,
    entity: &StoredEntity,
) -> Result<EntityRecord, AppError> {
    Ok(EntityRecord {
        name: entity.definition.name.clone(),
        revision: entity.revision,
        updated_at: entity.updated_at.clone(),
        rows: schema::row_count(connection, &entity.table()).await?,
        definition: entity.definition.clone(),
    })
}

/// The entity as it is now, read again after a write.
async fn fresh_record(
    connection: &mut SqliteConnection,
    name: &str,
) -> Result<EntityRecord, AppError> {
    let catalog = Catalog::load(connection).await?;
    record(connection, catalog.entity(name)?).await
}

async fn list_entities(State(state): State<AppState>) -> Result<Json<EntityList>, AppError> {
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let mut entities = Vec::with_capacity(catalog.entities.len());
    for entity in catalog.entities.values() {
        entities.push(record(&mut tx, entity).await?);
    }
    entities.sort_by_cached_key(|entity| entity.definition.display_name.to_lowercase());
    Ok(Json(EntityList { entities }))
}

async fn read_entity(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<EntityRecord>, AppError> {
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    Ok(Json(record(&mut tx, catalog.entity(&name)?).await?))
}

/// Everything a definition may name, as the database has it now.
async fn known_forms(connection: &mut SqliteConnection) -> Result<Vec<String>, AppError> {
    Ok(sqlx::query_scalar("SELECT id FROM forms")
        .fetch_all(connection)
        .await?)
}

fn known<'a>(catalog: &'a Catalog, forms: &'a [String]) -> Known<'a> {
    Known {
        entities: catalog.entities.keys().map(String::as_str).collect(),
        lists: catalog.lists.keys().map(String::as_str).collect(),
        forms: forms.iter().map(String::as_str).collect(),
    }
}

fn definition_of(body: &mut Map<String, Value>, what: &str) -> Result<Value, AppError> {
    body.remove("definition").ok_or_else(|| {
        AppError::invalid_request(format!("The request needs \"definition\": the {what}."))
    })
}

/// Whether a name is taken, ignoring case, by something of the same kind.
fn taken<'a>(mut names: impl Iterator<Item = &'a String>, name: &str) -> bool {
    names.any(|existing| existing.eq_ignore_ascii_case(name))
}

async fn create_entity(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<(StatusCode, Json<EntityRecord>), AppError> {
    let mut body = request_object(body)?;
    let document = definition_of(&mut body, "entity definition")?;

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let forms = known_forms(&mut tx).await?;
    let definition = validate::entity(&document, &known(&catalog, &forms))
        .map_err(|details| AppError::invalid("invalid_entity", "entity", details))?;
    if taken(catalog.entities.keys(), &definition.name) {
        return Err(AppError::refused(
            "name_taken",
            format!(
                "There is already an entity named {}. Choose another name.",
                definition.name
            ),
        ));
    }

    schema::create(&mut tx, &definition).await?;
    let created = fresh_record(&mut tx, &definition.name).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn update_entity(
    State(state): State<AppState>,
    Path(name): Path<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<EntityRecord>, AppError> {
    let mut body = request_object(body)?;
    let based_on = based_on_revision(&body)?;
    let document = definition_of(&mut body, "entity definition")?;
    let fill = match body.remove("fill") {
        None | Some(Value::Null) => Map::new(),
        Some(Value::Object(fill)) => fill,
        Some(_) => {
            return Err(AppError::invalid_request(
                "\"fill\" is an object: property name to the value for existing rows.",
            ));
        }
    };

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let stored = catalog.entity(&name)?;
    let forms = known_forms(&mut tx).await?;
    // The default form the entity already names is not this change's doing,
    // even when that form has since been deleted: it is dropped below.
    let mut known = known(&catalog, &forms);
    if let Some(form) = &stored.definition.default_form {
        known.forms.insert(form);
    }
    let mut definition = validate::entity(&document, &known)
        .map_err(|details| AppError::invalid("invalid_entity", "entity", details))?;
    if definition.name != stored.definition.name {
        return Err(AppError::invalid(
            "invalid_entity",
            "entity",
            vec![ErrorDetail::new(
                "name",
                format!(
                    "An entity's name is fixed once it is saved: this one is {}.",
                    stored.definition.name
                ),
            )],
        ));
    }
    if stored.revision != based_on {
        return Err(AppError::stale("entity", based_on, stored.revision));
    }
    // A default form that has since been deleted is dropped, not refused:
    // nothing about this change is wrong.
    if definition.default_form == stored.definition.default_form
        && definition
            .default_form
            .as_ref()
            .is_some_and(|form| !forms.contains(form))
    {
        definition.default_form = None;
    }

    match schema::update(&mut tx, &catalog, stored, &definition, &fill).await? {
        Change::Applied => {}
        Change::Invalid(details) => {
            return Err(AppError::invalid("invalid_entity", "entity", details));
        }
        Change::Refused(details) => {
            return Err(AppError::Refused {
                code: "change_refused",
                message: match details.len() {
                    1 => "This change would lose data, so nothing was changed.".to_owned(),
                    n => format!(
                        "This change would lose data in {n} places, so nothing was changed."
                    ),
                },
                details,
            });
        }
    }
    let updated = fresh_record(&mut tx, &name).await?;
    tx.commit().await?;
    Ok(Json(updated))
}

async fn delete_entity(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let stored = catalog.entity(&name)?;

    let users: Vec<String> = catalog
        .references_to(&name)
        .filter(|(owner, _)| owner.definition.name != name)
        .map(|(owner, property)| {
            format!(
                "{} of {}",
                property.display_name, owner.definition.display_name
            )
        })
        .collect();
    if !users.is_empty() {
        return Err(AppError::refused(
            "entity_in_use",
            format!(
                "{} cannot be deleted while other entities refer to it: {}. Delete or change {} first.",
                stored.definition.display_name,
                users.join(", "),
                if users.len() == 1 {
                    "that property"
                } else {
                    "those properties"
                }
            ),
        ));
    }

    schema::delete(&mut tx, stored).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// --- Reference lists -------------------------------------------------------

fn list_record(list: &StoredList) -> ReferenceListRecord {
    ReferenceListRecord {
        name: list.definition.name.clone(),
        revision: list.revision,
        updated_at: list.updated_at.clone(),
        definition: list.definition.clone(),
    }
}

async fn list_lists(State(state): State<AppState>) -> Result<Json<ReferenceListList>, AppError> {
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let mut reference_lists: Vec<_> = catalog.lists.values().map(list_record).collect();
    reference_lists.sort_by_cached_key(|list| list.definition.display_name.to_lowercase());
    Ok(Json(ReferenceListList { reference_lists }))
}

async fn read_list(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<ReferenceListRecord>, AppError> {
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    Ok(Json(list_record(catalog.list(&name)?)))
}

fn checked_list(document: &Value) -> Result<ReferenceListDefinition, AppError> {
    validate::reference_list(document)
        .map_err(|details| AppError::invalid("invalid_reference_list", "reference list", details))
}

fn list_json(definition: &ReferenceListDefinition) -> Result<String, AppError> {
    serde_json::to_string(definition).map_err(|error| {
        tracing::error!("cannot write a reference list as JSON: {error}");
        AppError::Internal
    })
}

async fn fresh_list(
    connection: &mut SqliteConnection,
    name: &str,
) -> Result<ReferenceListRecord, AppError> {
    let catalog = Catalog::load(connection).await?;
    Ok(list_record(catalog.list(name)?))
}

async fn create_list(
    State(state): State<AppState>,
    body: Result<Bytes, BytesRejection>,
) -> Result<(StatusCode, Json<ReferenceListRecord>), AppError> {
    let mut body = request_object(body)?;
    let definition = checked_list(&definition_of(&mut body, "reference list definition")?)?;

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    if taken(catalog.lists.keys(), &definition.name) {
        return Err(AppError::refused(
            "name_taken",
            format!(
                "There is already a reference list named {}. Choose another name.",
                definition.name
            ),
        ));
    }
    sqlx::query("INSERT INTO reference_lists (name, definition) VALUES (?, ?)")
        .bind(&definition.name)
        .bind(list_json(&definition)?)
        .execute(&mut *tx)
        .await?;
    let created = fresh_list(&mut tx, &definition.name).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn update_list(
    State(state): State<AppState>,
    Path(name): Path<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<ReferenceListRecord>, AppError> {
    let mut body = request_object(body)?;
    let based_on = based_on_revision(&body)?;
    let definition = checked_list(&definition_of(&mut body, "reference list definition")?)?;

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let stored = catalog.list(&name)?;
    if definition.name != stored.definition.name {
        return Err(AppError::invalid(
            "invalid_reference_list",
            "reference list",
            vec![ErrorDetail::new(
                "name",
                format!(
                    "A reference list's name is fixed once it is saved: this one is {}.",
                    stored.definition.name
                ),
            )],
        ));
    }
    if stored.revision != based_on {
        return Err(AppError::stale("reference list", based_on, stored.revision));
    }

    // An item that rows hold cannot go; it can be retired (spec 3.4).
    let mut refused = Vec::new();
    for item in &stored.definition.items {
        if definition.items.iter().any(|kept| kept.value == item.value) {
            continue;
        }
        for (owner, property) in catalog.uses_of_list(&name) {
            let held = held_by(&mut tx, owner, &owner.column_of(property), &item.value).await?;
            if held > 0 {
                refused.push(ErrorDetail::new(
                    "items",
                    format!(
                        "{} is the {} of {} of {}. Retire it instead of deleting it.",
                        item.label,
                        property.display_name,
                        rows(held),
                        owner.definition.display_name
                    ),
                ));
            }
        }
    }
    if !refused.is_empty() {
        return Err(AppError::Refused {
            code: "item_in_use",
            message: "Items that rows use cannot be deleted, so nothing was changed.".to_owned(),
            details: refused,
        });
    }

    sqlx::query(
        "UPDATE reference_lists SET definition = ?, revision = revision + 1, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE name = ?",
    )
    .bind(list_json(&definition)?)
    .bind(&stored.definition.name)
    .execute(&mut *tx)
    .await?;
    let updated = fresh_list(&mut tx, &name).await?;
    tx.commit().await?;
    Ok(Json(updated))
}

/// How many rows of `owner` hold `value` in `column`.
async fn held_by(
    connection: &mut SqliteConnection,
    owner: &StoredEntity,
    column: &str,
    value: &str,
) -> Result<u32, AppError> {
    // The table and column names are generated; the value is a parameter.
    let sql = format!("SELECT COUNT(*) FROM {} WHERE {column} = ?", owner.table());
    Ok(sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(value)
        .fetch_one(connection)
        .await?)
}

async fn delete_list(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let stored = catalog.list(&name)?;
    let users: Vec<String> = catalog
        .uses_of_list(&name)
        .map(|(owner, property)| {
            format!(
                "{} of {}",
                property.display_name, owner.definition.display_name
            )
        })
        .collect();
    if !users.is_empty() {
        return Err(AppError::refused(
            "reference_list_in_use",
            format!(
                "{} cannot be deleted while properties use it: {}.",
                stored.definition.display_name,
                users.join(", ")
            ),
        ));
    }
    sqlx::query("DELETE FROM reference_lists WHERE name = ?")
        .bind(&stored.definition.name)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
