//! How a definition becomes a table, and how a changed definition changes it
//! (ADR 0011, spec 3.3).
//!
//! - **Generated names only.** A table is `entity_<id>` and a column `c<n>`,
//!   both numbers the server hands out. Nothing a person typed is ever part
//!   of the SQL text; every value is a bound parameter.
//! - **Nothing loses data silently.** A change is compared with the rows that
//!   exist. One that cannot keep their values is refused, with the reason and
//!   the number of rows; nothing is changed.
//! - **All or nothing.** The caller runs everything here in one write
//!   transaction. SQLite's schema changes are transactional, so a refusal, or
//!   a failure half way, leaves the table and the definition as they were.

use std::collections::BTreeMap;

use contracts::{EntityDefinition, ErrorDetail, PropertyDefinition, PropertyType};
use serde_json::{Map, Value};
use sqlx::{AssertSqlSafe, QueryBuilder, Sqlite, SqliteConnection};

use super::catalog::{Catalog, StoredEntity};
use crate::data::values::{self, Cell, column_type};
use crate::error::AppError;

/// "1 row" or "12 rows".
pub fn rows(count: u32) -> String {
    match count {
        1 => "1 row".to_owned(),
        n => format!("{n} rows"),
    }
}

/// Runs SQL made only of generated names and keywords.
async fn execute(connection: &mut SqliteConnection, sql: String) -> Result<(), AppError> {
    sqlx::query(AssertSqlSafe(sql)).execute(connection).await?;
    Ok(())
}

/// Counts rows. `condition` is SQL made of generated names; values come
/// after it as bound parameters, each standing for one `?`-free push.
async fn count(
    connection: &mut SqliteConnection,
    table: &str,
    condition: impl FnOnce(&mut QueryBuilder<Sqlite>),
) -> Result<u32, AppError> {
    let mut builder = QueryBuilder::<Sqlite>::new(format!("SELECT COUNT(*) FROM {table} WHERE "));
    condition(&mut builder);
    let total: u32 = builder.build_query_scalar().fetch_one(connection).await?;
    Ok(total)
}

/// How many rows a table has.
pub async fn row_count(connection: &mut SqliteConnection, table: &str) -> Result<u32, AppError> {
    count(connection, table, |builder| {
        builder.push("1");
    })
    .await
}

fn index_name(table: &str, column: u32) -> String {
    format!("{table}_c{column}")
}

/// A reference column is looked up whenever a referenced row is deleted.
async fn add_index(
    connection: &mut SqliteConnection,
    table: &str,
    column: u32,
    kind: PropertyType,
) -> Result<(), AppError> {
    if kind != PropertyType::Reference {
        return Ok(());
    }
    let index = index_name(table, column);
    execute(
        connection,
        format!("CREATE INDEX {index} ON {table} (c{column})"),
    )
    .await
}

/// Stores a new entity and creates the table for its rows.
pub async fn create(
    connection: &mut SqliteConnection,
    definition: &EntityDefinition,
) -> Result<(), AppError> {
    let columns: BTreeMap<String, u32> = definition
        .properties
        .iter()
        .zip(1..)
        .map(|(property, number)| (property.name.clone(), number))
        .collect();
    let next_column = u32::try_from(columns.len()).unwrap_or(u32::MAX) + 1;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO entities (name, definition, columns, next_column) VALUES (?, ?, ?, ?) \
         RETURNING id",
    )
    .bind(&definition.name)
    .bind(json(definition)?)
    .bind(json(&columns)?)
    .bind(next_column)
    .fetch_one(&mut *connection)
    .await?;

    let table = format!("entity_{id}");
    let mut sql = format!(
        "CREATE TABLE {table} (\
         id TEXT PRIMARY KEY NOT NULL, \
         revision INTEGER NOT NULL DEFAULT 1, \
         created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), \
         updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
    );
    for property in &definition.properties {
        let number = columns[&property.name];
        sql.push_str(&format!(
            ", c{number} {}",
            column_type(property.property_type)
        ));
    }
    sql.push_str(") STRICT");
    execute(connection, sql).await?;

    for property in &definition.properties {
        add_index(
            connection,
            &table,
            columns[&property.name],
            property.property_type,
        )
        .await?;
    }
    Ok(())
}

/// Removes an entity, its table and every row in it.
pub async fn delete(
    connection: &mut SqliteConnection,
    entity: &StoredEntity,
) -> Result<(), AppError> {
    execute(connection, format!("DROP TABLE {}", entity.table())).await?;
    sqlx::query("DELETE FROM entities WHERE id = ?")
        .bind(entity.id)
        .execute(connection)
        .await?;
    Ok(())
}

/// What became of a changed definition.
pub enum Change {
    /// The table and the stored definition now match the new definition.
    Applied,
    /// The request itself is wrong: a value given for existing rows does not
    /// fit its property.
    Invalid(Vec<ErrorDetail>),
    /// The change cannot keep the values that exist. Nothing was changed.
    Refused(Vec<ErrorDetail>),
}

/// Changes a stored entity into `next`. `fill` gives, by property name, the
/// value for rows that have none where a property is new and required, or
/// newly required.
///
/// The catalog is the one read in this transaction. On anything but
/// `Applied` the caller must roll the transaction back.
pub async fn update(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    stored: &StoredEntity,
    next: &EntityDefinition,
    fill: &Map<String, Value>,
) -> Result<Change, AppError> {
    let table = stored.table();
    let total = row_count(connection, &table).await?;
    let mut columns = stored.columns.clone();
    let mut next_column = stored.next_column;
    let mut refused: Vec<ErrorDetail> = Vec::new();
    let mut invalid: Vec<ErrorDetail> = Vec::new();

    for name in fill.keys() {
        if !next
            .properties
            .iter()
            .any(|property| &property.name == name)
        {
            invalid.push(ErrorDetail::new(
                format!("fill.{name}"),
                format!("There is no property named {name:?} to give a value to."),
            ));
        }
    }

    for (index, property) in next.properties.iter().enumerate() {
        let path = format!("properties[{index}]");
        let label = &property.display_name;
        let before = stored.property(&property.name);

        // The value for rows that have none, checked like any other value.
        let filler = match fill.get(&property.name) {
            None | Some(Value::Null) => None,
            Some(value) => match fill_value(connection, catalog, property, value).await? {
                Ok(cell) => Some(cell),
                Err(message) => {
                    invalid.push(ErrorDetail::new(format!("fill.{}", property.name), message));
                    None
                }
            },
        };

        let replaces = match before {
            None => None,
            Some(old) if old.property_type != property.property_type => {
                // Another type means another column. That is only safe when
                // the old one holds nothing.
                let column = stored.column_of(old);
                let held = count(connection, &table, |builder| {
                    builder.push(holds_a_value(&column, old.property_type));
                })
                .await?;
                if held > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.type"),
                        format!(
                            "{label} has a value in {}, and a {} property cannot become a {} property without losing them. Clear those values first, or add a new property instead.",
                            rows(held),
                            old.property_type.word(),
                            property.property_type.word()
                        ),
                    ));
                    continue;
                }
                Some(old)
            }
            Some(old) => {
                let column = stored.column_of(old);
                tightened(
                    connection,
                    catalog,
                    &table,
                    &column,
                    old,
                    property,
                    &path,
                    &mut refused,
                )
                .await?;
                if property.required {
                    let empty = count(connection, &table, |builder| {
                        builder.push(format!("{column} IS NULL"));
                    })
                    .await?;
                    if empty > 0 {
                        match &filler {
                            Some(cell) => {
                                let mut builder = QueryBuilder::<Sqlite>::new(format!(
                                    "UPDATE {table} SET {column} = "
                                ));
                                cell.bind(&mut builder);
                                builder.push(format!(" WHERE {column} IS NULL"));
                                builder.build().execute(&mut *connection).await?;
                            }
                            None => refused.push(ErrorDetail::new(
                                format!("{path}.required"),
                                format!(
                                    "{label} has no value in {}. Give the value those rows should get, or leave it optional.",
                                    rows(empty)
                                ),
                            )),
                        }
                    }
                }
                continue;
            }
        };

        // A new column: for a new property, or for one whose type changed.
        if let Some(old) = replaces {
            drop_column(connection, &table, columns[&old.name]).await?;
        }
        let number = next_column;
        next_column += 1;
        columns.insert(property.name.clone(), number);
        execute(
            connection,
            format!(
                "ALTER TABLE {table} ADD COLUMN c{number} {}",
                column_type(property.property_type)
            ),
        )
        .await?;
        add_index(connection, &table, number, property.property_type).await?;

        if property.required && total > 0 {
            match &filler {
                Some(cell) => {
                    let mut builder =
                        QueryBuilder::<Sqlite>::new(format!("UPDATE {table} SET c{number} = "));
                    cell.bind(&mut builder);
                    builder.build().execute(&mut *connection).await?;
                }
                None => refused.push(ErrorDetail::new(
                    format!("{path}.required"),
                    format!(
                        "{label} is required, and {} already has {}. Give the value those rows should get, or add it as optional.",
                        stored.definition.display_name,
                        rows(total)
                    ),
                )),
            }
        }
    }

    // Properties that are gone take their column, and its values, with them.
    // Whoever sent the change was asked first (spec 3.3).
    for old in &stored.definition.properties {
        if !next.properties.iter().any(|p| p.name == old.name)
            && let Some(number) = columns.remove(&old.name)
        {
            drop_column(connection, &table, number).await?;
        }
    }

    if !invalid.is_empty() {
        return Ok(Change::Invalid(invalid));
    }
    if !refused.is_empty() {
        return Ok(Change::Refused(refused));
    }

    sqlx::query(
        "UPDATE entities SET definition = ?, columns = ?, next_column = ?, \
         revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?",
    )
    .bind(json(next)?)
    .bind(json(&columns)?)
    .bind(next_column)
    .bind(stored.id)
    .execute(connection)
    .await?;
    Ok(Change::Applied)
}

/// SQL that is true for a row whose column holds something worth keeping.
fn holds_a_value(column: &str, kind: PropertyType) -> String {
    match kind {
        // "No" is what a yes/no starts as; only a "yes" was ever chosen.
        PropertyType::Boolean => format!("{column} = 1"),
        _ => format!("{column} IS NOT NULL"),
    }
}

async fn drop_column(
    connection: &mut SqliteConnection,
    table: &str,
    number: u32,
) -> Result<(), AppError> {
    // SQLite will not drop a column that an index names.
    execute(
        connection,
        format!("DROP INDEX IF EXISTS {}", index_name(table, number)),
    )
    .await?;
    execute(
        connection,
        format!("ALTER TABLE {table} DROP COLUMN c{number}"),
    )
    .await
}

/// A value for existing rows, checked as a row's value would be.
async fn fill_value(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    property: &PropertyDefinition,
    value: &Value,
) -> Result<Result<Cell, String>, AppError> {
    let cell = match values::check(property, value, catalog, None) {
        Ok(cell) => cell,
        Err(message) => return Ok(Err(message)),
    };
    if cell.is_missing() {
        return Ok(Err(values::REQUIRED.to_owned()));
    }
    if property.property_type == PropertyType::Reference
        && let Cell::Text(id) = &cell
        && !crate::data::rows::exists(connection, catalog, property, id).await?
    {
        return Ok(Err(crate::data::rows::no_such_row(catalog, property)));
    }
    Ok(Ok(cell))
}

/// A property that keeps its type but narrows what it accepts: every limit
/// is checked against the values that exist, and refused if one breaks it.
#[expect(clippy::too_many_arguments)]
async fn tightened(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    table: &str,
    column: &str,
    old: &PropertyDefinition,
    new: &PropertyDefinition,
    path: &str,
    refused: &mut Vec<ErrorDetail>,
) -> Result<(), AppError> {
    let label = &new.display_name;
    match new.property_type {
        PropertyType::Text => {
            if let Some(max) = new.max_length
                && old.max_length.is_none_or(|before| max < before)
            {
                let over = count(connection, table, |builder| {
                    builder.push(format!("length({column}) > "));
                    builder.push_bind(max);
                })
                .await?;
                if over > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.maxLength"),
                        format!(
                            "{} {} a {label} longer than {max} characters. Shorten {} first.",
                            rows(over),
                            have(over),
                            them(over)
                        ),
                    ));
                }
            }
            if old.multiline && !new.multiline {
                let over = count(connection, table, |builder| {
                    builder.push(format!(
                        "instr({column}, char(10)) > 0 OR instr({column}, char(13)) > 0"
                    ));
                })
                .await?;
                if over > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.multiline"),
                        format!(
                            "{} {} a {label} that runs over several lines.",
                            rows(over),
                            have(over)
                        ),
                    ));
                }
            }
        }
        PropertyType::Number => {
            if new.whole && !old.whole {
                let broken = count(connection, table, |builder| {
                    builder.push(format!("{column} <> round({column})"));
                })
                .await?;
                if broken > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.whole"),
                        format!(
                            "{} {} a {label} that is not a whole number.",
                            rows(broken),
                            have(broken)
                        ),
                    ));
                }
            }
            if let Some(min) = new.min
                && old.min.is_none_or(|before| min > before)
            {
                let under = count(connection, table, |builder| {
                    builder.push(format!("{column} < "));
                    builder.push_bind(min);
                })
                .await?;
                if under > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.min"),
                        format!("{} {} a {label} below {min}.", rows(under), have(under)),
                    ));
                }
            }
            if let Some(max) = new.max
                && old.max.is_none_or(|before| max < before)
            {
                let over = count(connection, table, |builder| {
                    builder.push(format!("{column} > "));
                    builder.push_bind(max);
                })
                .await?;
                if over > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.max"),
                        format!("{} {} a {label} above {max}.", rows(over), have(over)),
                    ));
                }
            }
        }
        PropertyType::Date => {
            if let Some(earliest) = &new.earliest
                && old.earliest.as_ref().is_none_or(|before| earliest > before)
            {
                let before = count(connection, table, |builder| {
                    builder.push(format!("{column} < "));
                    builder.push_bind(earliest.clone());
                })
                .await?;
                if before > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.earliest"),
                        format!(
                            "{} {} a {label} before {earliest}.",
                            rows(before),
                            have(before)
                        ),
                    ));
                }
            }
            if let Some(latest) = &new.latest
                && old.latest.as_ref().is_none_or(|before| latest < before)
            {
                let after = count(connection, table, |builder| {
                    builder.push(format!("{column} > "));
                    builder.push_bind(latest.clone());
                })
                .await?;
                if after > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.latest"),
                        format!("{} {} a {label} after {latest}.", rows(after), have(after)),
                    ));
                }
            }
        }
        PropertyType::ReferenceList => {
            if new.reference_list != old.reference_list {
                let items: Vec<String> = catalog
                    .list_of(new)
                    .map(|list| {
                        list.definition
                            .items
                            .iter()
                            .map(|item| item.value.clone())
                            .collect()
                    })
                    .unwrap_or_default();
                let outside = count(connection, table, |builder| {
                    builder.push(format!("{column} IS NOT NULL"));
                    if !items.is_empty() {
                        builder.push(format!(" AND {column} NOT IN ("));
                        let mut list = builder.separated(", ");
                        for item in &items {
                            list.push_bind(item.clone());
                        }
                        builder.push(")");
                    }
                })
                .await?;
                if outside > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.referenceList"),
                        format!(
                            "{} {} a {label} that the new list does not have.",
                            rows(outside),
                            have(outside)
                        ),
                    ));
                }
            }
        }
        PropertyType::Reference => {
            if new.entity != old.entity {
                let held = count(connection, table, |builder| {
                    builder.push(format!("{column} IS NOT NULL"));
                })
                .await?;
                if held > 0 {
                    refused.push(ErrorDetail::new(
                        format!("{path}.entity"),
                        format!(
                            "{label} refers to a row in {}. It cannot point at another entity without losing them.",
                            rows(held)
                        ),
                    ));
                }
            }
        }
        PropertyType::Boolean => {}
    }
    Ok(())
}

fn have(count: u32) -> &'static str {
    if count == 1 { "has" } else { "have" }
}

fn them(count: u32) -> &'static str {
    if count == 1 { "it" } else { "them" }
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|error| {
        tracing::error!("cannot write a definition as JSON: {error}");
        AppError::Internal
    })
}
