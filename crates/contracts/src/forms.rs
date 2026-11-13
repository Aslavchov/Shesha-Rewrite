//! The form document and the forms API. See ADR 0003 (document), ADR 0006
//! (slot styles) and ADR 0007 (API).
//!
//! Only structure is defined here. What goes inside `settings` belongs to
//! each component type and is defined with the component in `web/`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

/// The one format version this build reads and writes.
pub const FORM_FORMAT_VERSION: u32 = 1;

/// Settings as stored: only what differs from the defaults, as JSON values
/// that the owning component type defines.
pub type Settings = Map<String, Value>;

/// A form: what is stored, sent over the API and rendered.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormDocument {
    /// Version of the whole document format. Never per component.
    pub format_version: u32,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    #[ts(as = "Option<String>", optional)]
    pub description: String,
    /// The form's own settings, stored sparsely like a component's.
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    #[ts(as = "Option<SettingsTs>", optional)]
    pub settings: Settings,
    /// The top-level region: instances in order.
    pub components: Vec<ComponentInstance>,
}

/// One component placed in a form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentInstance {
    /// Generated, stable, never reused, never shown to people.
    pub id: String,
    /// The component type id, such as `text-field`.
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub component_type: String,
    /// Unique within the form; a JavaScript identifier.
    pub name: String,
    /// Inputs only: the data path the value is stored under.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bind: Option<String>,
    /// Only the settings this instance changes.
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    #[ts(as = "Option<SettingsTs>", optional)]
    pub settings: Settings,
    /// Style overrides per named slot.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    #[ts(as = "Option<BTreeMap<String, SlotStyle>>", optional)]
    pub styles: BTreeMap<String, SlotStyle>,
    /// Containers only: region name to children in order.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    #[ts(as = "Option<BTreeMap<String, Vec<ComponentInstance>>>", optional)]
    pub regions: BTreeMap<String, Vec<ComponentInstance>>,
}

/// How `Settings` appears in TypeScript: the values are read by each
/// component's own parsers, so they are `unknown` to everything else.
#[derive(TS)]
#[ts(rename = "Settings", type = "Record<string, unknown>")]
pub struct SettingsTs;

/// The style overrides of one slot: a fixed set of typed properties.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(optional_fields)]
pub struct SlotStyle {
    /// Text colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<ColorValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<ColorValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<ColorValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<Radius>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeight>,
    /// Padding on all sides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<Space>,
}

/// A colour: a literal (`"#RRGGBB"` or `"#RRGGBBAA"`) or a theme token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum ColorValue {
    Literal(String),
    Token(ColorToken),
}

/// A reference to a system colour token, by its name after `--sys-color-`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ColorToken {
    pub token: String,
}

/// A step of the radius scale in `tokens.css`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Radius {
    None,
    Sm,
    Md,
    Lg,
    Xl,
    #[serde(rename = "2xl")]
    TwoXl,
    Full,
}

/// A font weight from `tokens.css`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FontWeight {
    Normal,
    Medium,
    Semibold,
}

/// A step of the space scale in `tokens.css`. Used for padding overrides and
/// for the `gap` setting of the form and of containers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Space {
    None,
    Xs,
    Sm,
    Md,
    Lg,
    Xl,
}

// --- API -----------------------------------------------------------------

/// One row of `GET /api/forms`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FormSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    pub revision: u32,
}

/// Body of `GET /api/forms`: most recently updated first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FormList {
    pub forms: Vec<FormSummary>,
}

/// A stored form: the body of every successful read and write of one form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FormRecord {
    pub id: String,
    /// Starts at 1 and goes up by one on every update.
    pub revision: u32,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    pub document: FormDocument,
}

/// Body of `POST /api/forms`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct CreateFormRequest {
    pub document: FormDocument,
}

/// Body of `PUT /api/forms/{id}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct UpdateFormRequest {
    /// The revision this change was based on.
    pub revision: u32,
    pub document: FormDocument,
}
