//! Entity and reference list definitions, and the API that manages them.
//! See ADR 0011.
//!
//! A definition is what an administrator decides about an entity: its
//! properties, their types and their limits. How it is stored (which table,
//! which column) never appears here: tables and columns have generated names
//! that only the server knows.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::data::DataValuesTs;

/// How many properties an entity may have.
pub const ENTITY_MAX_PROPERTIES: u32 = 200;

/// How many items a reference list may have.
pub const REFERENCE_LIST_MAX_ITEMS: u32 = 200;

/// The longest name of an entity, a property or a reference list, and the
/// longest value of a reference list item.
pub const DEFINITION_MAX_NAME_CHARS: u32 = 64;

/// The longest display name or item label.
pub const DEFINITION_MAX_DISPLAY_NAME_CHARS: u32 = 200;

/// The longest help text of a property.
pub const DEFINITION_MAX_HELP_TEXT_CHARS: u32 = 1000;

/// The longest text value a row may hold, whatever the property says.
pub const TEXT_MAX_LENGTH: u32 = 100_000;

/// What every row has besides its entity's properties. No property may take
/// one of these names.
pub const SYSTEM_PROPERTIES: [&str; 4] = ["id", "createdAt", "updatedAt", "revision"];

/// The colours a reference list item may have: the members of `ItemColor`,
/// in order. A test keeps the two in step.
pub const ITEM_COLORS: [&str; 6] = [
    "muted",
    "primary",
    "success",
    "warning",
    "info",
    "destructive",
];

fn is_false(value: &bool) -> bool {
    !*value
}

/// An entity: a kind of record the app stores, such as Person.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityDefinition {
    /// Used in the API and fixed once the entity is saved: an identifier.
    pub name: String,
    /// What people call it. Can always change.
    pub display_name: String,
    /// In the order they are shown.
    pub properties: Vec<PropertyDefinition>,
    /// The text property that stands for a row in pickers, references and
    /// confirmation messages. Without one, a row is shown by its id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub display_property: Option<String>,
    /// The id of the form opened for a row of this entity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub default_form: Option<String>,
}

/// One property of an entity. The limits are flat members; each belongs to
/// one type and is left out for every other.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyDefinition {
    /// The data path of a bound input, and the key of the value in a row.
    /// An identifier, fixed once saved.
    pub name: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    #[ts(as = "Option<String>", optional)]
    pub help_text: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub property_type: PropertyType,
    /// A row must have a value. Not for yes/no, which always has one.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub required: bool,
    /// Forms show the value and do not let people change it.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub read_only: bool,

    /// Text: the most characters a value may have.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max_length: Option<u32>,
    /// Text: the value may run over several lines.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub multiline: bool,

    /// Number: only whole numbers.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub whole: bool,
    /// Number: the smallest value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub min: Option<f64>,
    /// Number: the largest value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max: Option<f64>,

    /// Date: the earliest day, as "YYYY-MM-DD".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub earliest: Option<String>,
    /// Date: the latest day, as "YYYY-MM-DD".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub latest: Option<String>,

    /// Reference list: the name of the list its values come from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reference_list: Option<String>,

    /// Reference: the name of the entity its rows are chosen from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub entity: Option<String>,
}

/// What a property holds (spec 3.2). Each maps to one value type of ADR 0005,
/// with `reference` the one this phase adds: the referenced row's id.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum PropertyType {
    Text,
    Number,
    Boolean,
    Date,
    ReferenceList,
    Reference,
}

impl PropertyType {
    /// The type as a word, for messages: "a {word} property".
    pub fn word(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Number => "number",
            Self::Boolean => "yes/no",
            Self::Date => "date",
            Self::ReferenceList => "reference list",
            Self::Reference => "reference",
        }
    }
}

/// A reference list: a fixed set of choices, such as Person status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReferenceListDefinition {
    /// An identifier, fixed once the list is saved.
    pub name: String,
    pub display_name: String,
    /// In the order they are offered.
    pub items: Vec<ReferenceListItem>,
}

/// One choice of a reference list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReferenceListItem {
    /// What rows store: a stable key, fixed once saved.
    pub value: String,
    /// What people see. Can be renamed freely.
    pub label: String,
    #[serde(default)]
    pub color: ItemColor,
    /// Hidden from new choices; still shown wherever a row holds it.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub retired: bool,
}

/// The colour of a reference list item: a role of the theme, so it follows
/// light and dark mode and any published theme.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ItemColor {
    #[default]
    Muted,
    Primary,
    Success,
    Warning,
    Info,
    Destructive,
}

// --- API -----------------------------------------------------------------

/// A stored entity: the body of every successful read and write of one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecord {
    pub name: String,
    /// Starts at 1 and goes up by one on every change to the definition.
    pub revision: u32,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    /// How many rows the entity has now.
    pub rows: u32,
    pub definition: EntityDefinition,
}

/// Body of `GET /api/entities`, ordered by display name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct EntityList {
    pub entities: Vec<EntityRecord>,
}

/// Body of `POST /api/entities`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct CreateEntityRequest {
    pub definition: EntityDefinition,
}

/// Body of `PUT /api/entities/{name}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct UpdateEntityRequest {
    /// The revision this change was based on.
    pub revision: u32,
    pub definition: EntityDefinition,
    /// Property name to the value given to rows that have none, for a
    /// property that is new and required, or newly required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<DataValuesTs>", optional)]
    pub fill: Option<serde_json::Map<String, serde_json::Value>>,
}

/// A stored reference list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceListRecord {
    pub name: String,
    pub revision: u32,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    pub definition: ReferenceListDefinition,
}

/// Body of `GET /api/reference-lists`, ordered by display name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceListList {
    pub reference_lists: Vec<ReferenceListRecord>,
}

/// Body of `POST /api/reference-lists`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CreateReferenceListRequest {
    pub definition: ReferenceListDefinition,
}

/// Body of `PUT /api/reference-lists/{name}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct UpdateReferenceListRequest {
    /// The revision this change was based on.
    pub revision: u32,
    pub definition: ReferenceListDefinition,
}
