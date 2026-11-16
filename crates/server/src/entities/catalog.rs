//! The definitions as stored: every entity with the table and columns that
//! hold its rows, and every reference list. Read fresh for each request, in
//! the same transaction as the work it guides, so a request never acts on a
//! definition that has since changed.

use std::collections::BTreeMap;

use contracts::{
    EntityDefinition, PropertyDefinition, PropertyType, ReferenceListDefinition, ReferenceListItem,
};
use sqlx::SqliteConnection;

use crate::error::AppError;

/// An entity as stored: its definition, and where its rows are.
#[derive(Debug, Clone)]
pub struct StoredEntity {
    /// Never reused. The rows are in the table `entity_<id>`.
    pub id: i64,
    pub revision: u32,
    pub updated_at: String,
    pub definition: EntityDefinition,
    /// Property name to the number N of its column `cN`.
    pub columns: BTreeMap<String, u32>,
    /// The next column number to hand out. Numbers are never reused.
    pub next_column: u32,
}

impl StoredEntity {
    /// The generated name of the table that holds the rows.
    pub fn table(&self) -> String {
        format!("entity_{}", self.id)
    }

    /// The generated name of a property's column.
    pub fn column(&self, property: &str) -> Option<String> {
        self.columns
            .get(property)
            .map(|number| format!("c{number}"))
    }

    /// As `column`, for a property the definition is known to have.
    pub fn column_of(&self, property: &PropertyDefinition) -> String {
        self.column(&property.name).unwrap_or_else(|| {
            // The definition and the column map are written together.
            panic!(
                "entity {} has no column for property {}",
                self.definition.name, property.name
            )
        })
    }

    pub fn property(&self, name: &str) -> Option<&PropertyDefinition> {
        self.definition
            .properties
            .iter()
            .find(|property| property.name == name)
    }

    /// The property whose value stands for a row, if the entity names one.
    pub fn display_property(&self) -> Option<&PropertyDefinition> {
        self.definition
            .display_property
            .as_deref()
            .and_then(|name| self.property(name))
    }

    /// SQL for what stands for a row of this entity, given the alias of its
    /// table: the display property's value, or the id.
    pub fn display_sql(&self, alias: &str) -> String {
        match self.display_property() {
            Some(property) => {
                format!("COALESCE({alias}.{}, {alias}.id)", self.column_of(property))
            }
            None => format!("{alias}.id"),
        }
    }
}

/// A reference list as stored.
#[derive(Debug, Clone)]
pub struct StoredList {
    pub revision: u32,
    pub updated_at: String,
    pub definition: ReferenceListDefinition,
}

impl StoredList {
    pub fn item(&self, value: &str) -> Option<&ReferenceListItem> {
        self.definition
            .items
            .iter()
            .find(|item| item.value == value)
    }
}

/// Every definition, by name.
#[derive(Debug, Clone, Default)]
pub struct Catalog {
    pub entities: BTreeMap<String, StoredEntity>,
    pub lists: BTreeMap<String, StoredList>,
}

type EntityRow = (i64, String, String, u32, u32, String);
type ListRow = (String, u32, String);

impl Catalog {
    pub async fn load(connection: &mut SqliteConnection) -> Result<Self, AppError> {
        let mut catalog = Self::default();

        let rows: Vec<EntityRow> = sqlx::query_as(
            "SELECT id, definition, columns, next_column, revision, updated_at FROM entities",
        )
        .fetch_all(&mut *connection)
        .await?;
        for (id, definition, columns, next_column, revision, updated_at) in rows {
            let definition: EntityDefinition = stored_json(&definition, "entity definition")?;
            let columns: BTreeMap<String, u32> = stored_json(&columns, "entity column map")?;
            catalog.entities.insert(
                definition.name.clone(),
                StoredEntity {
                    id,
                    revision,
                    updated_at,
                    definition,
                    columns,
                    next_column,
                },
            );
        }

        let rows: Vec<ListRow> =
            sqlx::query_as("SELECT definition, revision, updated_at FROM reference_lists")
                .fetch_all(&mut *connection)
                .await?;
        for (definition, revision, updated_at) in rows {
            let definition: ReferenceListDefinition =
                stored_json(&definition, "reference list definition")?;
            catalog.lists.insert(
                definition.name.clone(),
                StoredList {
                    revision,
                    updated_at,
                    definition,
                },
            );
        }
        Ok(catalog)
    }

    /// The entity, or 404 `entity_not_found`.
    pub fn entity(&self, name: &str) -> Result<&StoredEntity, AppError> {
        self.entities
            .get(name)
            .ok_or_else(|| entity_not_found(name))
    }

    /// The list, or 404 `reference_list_not_found`.
    pub fn list(&self, name: &str) -> Result<&StoredList, AppError> {
        self.lists.get(name).ok_or_else(|| list_not_found(name))
    }

    /// The list a reference list property takes its values from.
    pub fn list_of(&self, property: &PropertyDefinition) -> Option<&StoredList> {
        property
            .reference_list
            .as_deref()
            .and_then(|name| self.lists.get(name))
    }

    /// The entity a reference property points at.
    pub fn target_of(&self, property: &PropertyDefinition) -> Option<&StoredEntity> {
        property
            .entity
            .as_deref()
            .and_then(|name| self.entities.get(name))
    }

    /// Every reference property, in any entity, that points at `entity`.
    pub fn references_to<'a>(
        &'a self,
        entity: &'a str,
    ) -> impl Iterator<Item = (&'a StoredEntity, &'a PropertyDefinition)> {
        self.entities.values().flat_map(move |owner| {
            owner
                .definition
                .properties
                .iter()
                .filter(move |property| {
                    property.property_type == PropertyType::Reference
                        && property.entity.as_deref() == Some(entity)
                })
                .map(move |property| (owner, property))
        })
    }

    /// Every property, in any entity, that takes its values from `list`.
    pub fn uses_of_list<'a>(
        &'a self,
        list: &'a str,
    ) -> impl Iterator<Item = (&'a StoredEntity, &'a PropertyDefinition)> {
        self.entities.values().flat_map(move |owner| {
            owner
                .definition
                .properties
                .iter()
                .filter(move |property| {
                    property.property_type == PropertyType::ReferenceList
                        && property.reference_list.as_deref() == Some(list)
                })
                .map(move |property| (owner, property))
        })
    }
}

pub fn entity_not_found(name: &str) -> AppError {
    AppError::missing(
        "entity_not_found",
        format!("There is no entity named {name}."),
    )
}

pub fn list_not_found(name: &str) -> AppError {
    AppError::missing(
        "reference_list_not_found",
        format!("There is no reference list named {name}."),
    )
}

/// Reads JSON this server wrote. It was checked when it was written, so a
/// failure is the server's own fault.
fn stored_json<T: serde::de::DeserializeOwned>(text: &str, what: &str) -> Result<T, AppError> {
    serde_json::from_str(text).map_err(|error| {
        tracing::error!("stored {what} cannot be read: {error}");
        AppError::Internal
    })
}
