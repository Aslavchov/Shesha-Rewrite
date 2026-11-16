//! The data API: the rows of an entity, and the one query format that lists
//! them. See ADR 0011.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

/// The page size of a list query that names none.
pub const DATA_DEFAULT_PAGE_SIZE: u32 = 25;

/// The largest page a list query may ask for.
pub const DATA_MAX_PAGE_SIZE: u32 = 200;

/// The longest quick-search text.
pub const DATA_MAX_SEARCH_CHARS: u32 = 200;

/// How many filters, and how many sort keys, a list query may carry.
pub const DATA_MAX_FILTERS: u32 = 50;
pub const DATA_MAX_SORTS: u32 = 8;

/// The values of a row, by property name. Text, date, reference list and
/// reference values are strings, numbers are JSON numbers, yes/no is a
/// boolean, and `null` is "no value" (ADR 0005).
pub type DataValues = Map<String, Value>;

/// How `DataValues` appears in TypeScript.
#[derive(TS)]
#[ts(
    rename = "DataValues",
    type = "Record<string, string | number | boolean | null>"
)]
pub struct DataValuesTs;

/// One row of an entity, as every read and write returns it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DataRow {
    /// Chosen by the server: 32 lowercase hex characters. Seeded demo rows
    /// have fixed, readable ids.
    pub id: String,
    /// Starts at 1 and goes up by one on every update.
    pub revision: u32,
    /// UTC, RFC 3339 with milliseconds.
    pub created_at: String,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    /// What stands for the row where one line must do: the value of the
    /// entity's display property, or the id when it has none.
    pub display: String,
    /// The properties asked for, by name.
    #[ts(as = "DataValuesTs")]
    pub values: DataValues,
    /// For each reference property among `values` that has a value: the
    /// display value of the row it refers to.
    pub references: BTreeMap<String, String>,
}

/// Body of `POST /api/data/{entity}/query`: one page of rows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DataPage {
    pub rows: Vec<DataRow>,
    /// The page returned, from 1.
    pub page: u32,
    pub page_size: u32,
    /// How many rows match the filters and the search, on every page.
    pub total: u32,
}

/// The request of `POST /api/data/{entity}/query`. Every member is optional:
/// `{}` is the first page of every row.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(optional_fields)]
pub struct DataQuery {
    /// The properties to return. Left out: all of them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub select: Option<Vec<String>>,
    /// Every filter must hold.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<Vec<DataFilter>>,
    /// Quick search: rows where a text property, the label of a reference
    /// list value, or the display value of a referenced row contains this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    /// The first key decides, the next breaks its ties.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort: Option<Vec<DataSort>>,
    /// From 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
}

/// One typed condition on one property.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DataFilter {
    pub property: String,
    pub op: FilterOp,
    /// What to compare with, of the property's own type. A list for `in`;
    /// left out for `empty` and `notEmpty`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "string | number | boolean | Array<string>")]
    pub value: Option<Value>,
}

/// How a filter compares. Which ones apply depends on the property's type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum FilterOp {
    Eq,
    Contains,
    StartsWith,
    Gt,
    Gte,
    Lt,
    Lte,
    In,
    Empty,
    NotEmpty,
}

impl FilterOp {
    pub fn name(self) -> &'static str {
        match self {
            Self::Eq => "eq",
            Self::Contains => "contains",
            Self::StartsWith => "startsWith",
            Self::Gt => "gt",
            Self::Gte => "gte",
            Self::Lt => "lt",
            Self::Lte => "lte",
            Self::In => "in",
            Self::Empty => "empty",
            Self::NotEmpty => "notEmpty",
        }
    }
}

/// One sort key: a property, or `id`, `createdAt` or `updatedAt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DataSort {
    pub property: String,
    #[serde(default)]
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    #[default]
    Asc,
    Desc,
}

/// Body of `POST /api/data/{entity}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct CreateRowRequest {
    #[ts(as = "DataValuesTs")]
    pub values: DataValues,
}

/// Body of `PATCH /api/data/{entity}/{id}`. Properties that are left out
/// keep their values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct UpdateRowRequest {
    /// The revision this change was based on.
    pub revision: u32,
    #[ts(as = "DataValuesTs")]
    pub values: DataValues,
}
