//! The rows of an entity: reading, creating, updating and deleting them
//! (spec section 4). Table and column names are generated (`schema.rs`);
//! every value is a bound parameter.

use std::collections::BTreeMap;

use contracts::{DataRow, DataValues, ErrorDetail, PropertyDefinition, PropertyType};
use serde_json::Value;
use sqlx::sqlite::SqliteRow;
use sqlx::{AssertSqlSafe, QueryBuilder, Row, Sqlite, SqliteConnection};

use super::values::{self, Cell};
use crate::entities::catalog::{Catalog, StoredEntity};
use crate::entities::schema::rows as count_rows;
use crate::error::AppError;

/// Reads rows of one entity with some of its properties. It writes the
/// `SELECT … FROM …` every read shares and turns each result row into a
/// `DataRow`; the caller adds its own `WHERE`, `ORDER BY` and `LIMIT`.
pub struct Reader<'a> {
    catalog: &'a Catalog,
    pub entity: &'a StoredEntity,
    properties: Vec<&'a PropertyDefinition>,
}

/// The alias of the entity's own table in every statement.
pub const TABLE: &str = "t";

impl<'a> Reader<'a> {
    /// Every property, in the entity's own order.
    pub fn all(catalog: &'a Catalog, entity: &'a StoredEntity) -> Self {
        Self {
            catalog,
            entity,
            properties: entity.definition.properties.iter().collect(),
        }
    }

    /// Only the properties given, in the entity's own order.
    pub fn only(
        catalog: &'a Catalog,
        entity: &'a StoredEntity,
        names: &[&PropertyDefinition],
    ) -> Self {
        Self {
            catalog,
            entity,
            properties: entity
                .definition
                .properties
                .iter()
                .filter(|property| names.iter().any(|name| name.name == property.name))
                .collect(),
        }
    }

    /// The alias of the table a reference property joins to.
    pub fn join_alias(&self, property: &PropertyDefinition) -> String {
        format!("j{}", self.entity.columns[&property.name])
    }

    /// The column of a property, qualified with the table's alias.
    pub fn column(&self, property: &PropertyDefinition) -> String {
        format!("{TABLE}.{}", self.entity.column_of(property))
    }

    /// SQL for the display value of the row a reference property points at.
    pub fn reference_display(&self, property: &PropertyDefinition) -> Option<String> {
        self.catalog
            .target_of(property)
            .map(|target| target.display_sql(&self.join_alias(property)))
    }

    /// `SELECT` and the columns: the system properties, what stands for the
    /// row, then each property, a reference followed by its display value.
    pub fn push_select(&self, builder: &mut QueryBuilder<Sqlite>) {
        builder.push(format!(
            "SELECT {TABLE}.id, {TABLE}.revision, {TABLE}.created_at, {TABLE}.updated_at, {}",
            self.entity.display_sql(TABLE)
        ));
        for property in &self.properties {
            builder.push(format!(", {}", self.column(property)));
            if property.property_type == PropertyType::Reference {
                let display = self
                    .reference_display(property)
                    .unwrap_or_else(|| "NULL".to_owned());
                builder.push(format!(", {display}"));
            }
        }
    }

    /// `FROM` the entity's table, joined to the table of every entity it
    /// refers to. A join nothing reads costs nothing: SQLite leaves it out.
    pub fn push_from(&self, builder: &mut QueryBuilder<Sqlite>) {
        builder.push(format!(" FROM {} {TABLE}", self.entity.table()));
        for property in &self.entity.definition.properties {
            if property.property_type != PropertyType::Reference {
                continue;
            }
            if let Some(target) = self.catalog.target_of(property) {
                let alias = self.join_alias(property);
                builder.push(format!(
                    " LEFT JOIN {} {alias} ON {alias}.id = {}",
                    target.table(),
                    self.column(property)
                ));
            }
        }
    }

    /// One result row of a statement begun with `push_select`.
    pub fn read(&self, row: &SqliteRow) -> Result<DataRow, sqlx::Error> {
        let mut values = DataValues::new();
        let mut references = BTreeMap::new();
        let mut index = 5;
        for property in &self.properties {
            let cell = match property.property_type {
                PropertyType::Number => row
                    .try_get::<Option<f64>, _>(index)?
                    .map_or(Cell::Null, Cell::Real),
                PropertyType::Boolean => row
                    .try_get::<Option<i64>, _>(index)?
                    .map_or(Cell::Null, Cell::Int),
                _ => row
                    .try_get::<Option<String>, _>(index)?
                    .map_or(Cell::Null, Cell::Text),
            };
            index += 1;
            if property.property_type == PropertyType::Reference {
                if let Some(display) = row.try_get::<Option<String>, _>(index)? {
                    references.insert(property.name.clone(), display);
                }
                index += 1;
            }
            values.insert(property.name.clone(), cell.to_json(property));
        }
        Ok(DataRow {
            id: row.try_get(0)?,
            revision: row.try_get(1)?,
            created_at: row.try_get(2)?,
            updated_at: row.try_get(3)?,
            display: row.try_get(4)?,
            values,
            references,
        })
    }
}

/// One row with every property, or `None`.
pub async fn get(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &StoredEntity,
    id: &str,
) -> Result<Option<DataRow>, AppError> {
    let reader = Reader::all(catalog, entity);
    let mut builder = QueryBuilder::<Sqlite>::new("");
    reader.push_select(&mut builder);
    reader.push_from(&mut builder);
    builder.push(format!(" WHERE {TABLE}.id = "));
    builder.push_bind(id.to_owned());
    let row = builder.build().fetch_optional(connection).await?;
    Ok(row.map(|row| reader.read(&row)).transpose()?)
}

pub fn row_not_found(entity: &StoredEntity, id: &str) -> AppError {
    AppError::missing(
        "row_not_found",
        format!(
            "There is no {} with the id {id}.",
            entity.definition.display_name
        ),
    )
}

/// Whether the row a reference would point at exists.
pub async fn exists(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    property: &PropertyDefinition,
    id: &str,
) -> Result<bool, AppError> {
    let Some(target) = catalog.target_of(property) else {
        return Ok(false);
    };
    let sql = format!("SELECT COUNT(*) FROM {} WHERE id = ?", target.table());
    let found: u32 = sqlx::query_scalar(AssertSqlSafe(sql))
        .bind(id)
        .fetch_one(connection)
        .await?;
    Ok(found > 0)
}

/// The message of a reference to a row that is not there.
pub fn no_such_row(catalog: &Catalog, property: &PropertyDefinition) -> String {
    match catalog.target_of(property) {
        Some(target) => format!(
            "There is no {} with that id",
            target.definition.display_name
        ),
        None => "That row does not exist".to_owned(),
    }
}

/// The cell a row holds for a property, from the row as the API returns it.
fn held(row: &DataRow, property: &PropertyDefinition) -> Cell {
    match row.values.get(&property.name) {
        Some(Value::String(text)) => Cell::Text(text.clone()),
        Some(Value::Number(number)) => number.as_f64().map_or(Cell::Null, Cell::Real),
        Some(Value::Bool(flag)) => Cell::Int(i64::from(*flag)),
        _ => Cell::Null,
    }
}

/// Checks the values a request sent (spec section 4, "Server validation").
/// Each problem's path is the property's name. Returns the cells to write,
/// for the properties that were sent.
async fn checked<'a>(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &'a StoredEntity,
    values: &DataValues,
    current: Option<&DataRow>,
) -> Result<Vec<(&'a PropertyDefinition, Cell)>, AppError> {
    let mut problems = Vec::new();
    let mut cells = Vec::new();

    for name in values.keys() {
        if entity.property(name).is_none() {
            problems.push(ErrorDetail::new(
                name.clone(),
                format!(
                    "{} has no property named {name:?}.",
                    entity.definition.display_name
                ),
            ));
        }
    }

    for property in &entity.definition.properties {
        let sent = values.get(&property.name);
        // A new row is checked whole; an update only where it changes.
        let Some(value) = sent.or(if current.is_none() {
            Some(&Value::Null)
        } else {
            None
        }) else {
            continue;
        };
        let before = current.map(|row| held(row, property));
        let cell = match values::check(property, value, catalog, before.as_ref()) {
            Ok(cell) => cell,
            Err(message) => {
                problems.push(ErrorDetail::new(property.name.clone(), message));
                continue;
            }
        };
        if property.required && cell.is_missing() {
            problems.push(ErrorDetail::new(property.name.clone(), values::REQUIRED));
            continue;
        }
        if property.property_type == PropertyType::Reference
            && let Cell::Text(id) = &cell
            && before.as_ref() != Some(&cell)
            && !exists(connection, catalog, property, id).await?
        {
            problems.push(ErrorDetail::new(
                property.name.clone(),
                no_such_row(catalog, property),
            ));
            continue;
        }
        if sent.is_some() || current.is_none() {
            cells.push((property, cell));
        }
    }

    if problems.is_empty() {
        Ok(cells)
    } else {
        Err(AppError::invalid("invalid_row", "row", problems))
    }
}

/// Stores a new row at revision 1. `id` is for seeded rows, whose ids are
/// fixed; otherwise the database picks 16 random bytes, written as hex.
pub async fn create(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &StoredEntity,
    values: &DataValues,
    id: Option<&str>,
) -> Result<DataRow, AppError> {
    let cells = checked(connection, catalog, entity, values, None).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(format!("INSERT INTO {} (id", entity.table()));
    for (property, _) in &cells {
        builder.push(format!(", {}", entity.column_of(property)));
    }
    builder.push(") VALUES (COALESCE(");
    builder.push_bind(id.map(str::to_owned));
    builder.push(", lower(hex(randomblob(16))))");
    for (_, cell) in &cells {
        builder.push(", ");
        cell.bind(&mut builder);
    }
    builder.push(") RETURNING id");
    let id: String = builder
        .build_query_scalar()
        .fetch_one(&mut *connection)
        .await?;

    get(connection, catalog, entity, &id)
        .await?
        .ok_or(AppError::Internal)
}

/// Changes the properties that were sent, if `based_on` is still the row's
/// revision. The rest keep their values.
pub async fn update(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &StoredEntity,
    id: &str,
    based_on: u32,
    values: &DataValues,
) -> Result<DataRow, AppError> {
    let Some(current) = get(connection, catalog, entity, id).await? else {
        return Err(row_not_found(entity, id));
    };
    let cells = checked(connection, catalog, entity, values, Some(&current)).await?;
    if current.revision != based_on {
        return Err(AppError::stale("row", based_on, current.revision));
    }

    let mut builder = QueryBuilder::<Sqlite>::new(format!(
        "UPDATE {} SET revision = revision + 1, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        entity.table()
    ));
    for (property, cell) in &cells {
        builder.push(format!(", {} = ", entity.column_of(property)));
        cell.bind(&mut builder);
    }
    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.build().execute(&mut *connection).await?;

    get(connection, catalog, entity, id)
        .await?
        .ok_or(AppError::Internal)
}

/// Deletes a row, unless other rows refer to it.
pub async fn delete(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &StoredEntity,
    id: &str,
) -> Result<(), AppError> {
    let Some(current) = get(connection, catalog, entity, id).await? else {
        return Err(row_not_found(entity, id));
    };

    let mut users = Vec::new();
    for (owner, property) in catalog.references_to(&entity.definition.name) {
        let sql = format!(
            "SELECT COUNT(*) FROM {} WHERE {} = ?",
            owner.table(),
            owner.column_of(property)
        );
        let referring: u32 = sqlx::query_scalar(AssertSqlSafe(sql))
            .bind(id)
            .fetch_one(&mut *connection)
            .await?;
        if referring > 0 {
            users.push(format!(
                "{} of {} {} to it as {}",
                count_rows(referring),
                owner.definition.display_name,
                if referring == 1 { "refers" } else { "refer" },
                property.display_name
            ));
        }
    }
    if !users.is_empty() {
        return Err(AppError::refused(
            "row_in_use",
            format!(
                "{} cannot be deleted: {}. Change or delete {} first.",
                current.display,
                users.join(", and "),
                if users.len() == 1 && users[0].starts_with("1 row ") {
                    "that row"
                } else {
                    "those rows"
                }
            ),
        ));
    }

    let sql = format!("DELETE FROM {} WHERE id = ?", entity.table());
    sqlx::query(AssertSqlSafe(sql))
        .bind(id)
        .execute(connection)
        .await?;
    Ok(())
}
