//! The theme document and the theme API. See ADR 0010.
//!
//! A theme stores only what differs from the built-in look, so an empty one
//! (`{ "formatVersion": 1 }`) is that look. Component defaults are slot
//! styles (ADR 0006), keyed by component type and slot name; which types and
//! slots exist is known to `web/` only.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::forms::SlotStyle;

/// The one theme format version this build reads and writes.
pub const THEME_FORMAT_VERSION: u32 = 1;

/// The smallest and largest base radius, in pixels. The built-in look is 8.
pub const THEME_RADIUS_MIN: u32 = 0;
pub const THEME_RADIUS_MAX: u32 = 16;

/// The smallest and largest base text size, in pixels. The built-in look
/// is 14.
pub const THEME_TEXT_SIZE_MIN: u32 = 13;
pub const THEME_TEXT_SIZE_MAX: u32 = 16;

/// How many component types a theme may style.
pub const THEME_MAX_COMPONENTS: u32 = 200;

/// How many slots a theme may style on one component type.
pub const THEME_MAX_SLOTS: u32 = 50;

/// The colour roles a theme can set: the members of `ThemeColors`, in
/// order. A test keeps the two in step.
pub const THEME_COLOR_ROLES: [&str; 7] = [
    "primary",
    "destructive",
    "success",
    "warning",
    "info",
    "background",
    "sidebar",
];

/// The app's theme: what is stored, sent over the API and applied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeDocument {
    /// Version of the whole theme format.
    pub format_version: u32,
    /// Only the colour roles this theme changes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub colors: Option<ThemeColors>,
    /// The base radius in pixels; the whole radius scale follows it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub radius: Option<u32>,
    /// The base UI text size in pixels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub text_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub density: Option<Density>,
    /// Default slot styles: component type to slot name to style.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    #[ts(as = "Option<BTreeMap<String, BTreeMap<String, SlotStyle>>>", optional)]
    pub components: BTreeMap<String, BTreeMap<String, SlotStyle>>,
}

/// The colour roles of a theme. Each is left out until it is changed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(optional_fields)]
pub struct ThemeColors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary: Option<ThemeColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destructive: Option<ThemeColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub success: Option<ThemeColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warning: Option<ThemeColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub info: Option<ThemeColor>,
    /// The page background.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<ThemeColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar: Option<ThemeColor>,
}

/// One colour role: `"#RRGGBB"` for light mode and for dark mode. A dark
/// value that is left out is derived from the light one.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(optional_fields)]
pub struct ThemeColor {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub light: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dark: Option<String>,
}

/// Control height and spacing, as named steps. The built-in look is
/// `regular`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    Regular,
    Comfortable,
}

// --- API -----------------------------------------------------------------

/// The theme as published, or its draft: the body of `GET /api/theme`, and
/// each half of a `ThemeState`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThemeRecord {
    /// Starts at 1 and goes up by one every time the document changes.
    pub revision: u32,
    /// UTC, RFC 3339 with milliseconds.
    pub updated_at: String,
    pub document: ThemeDocument,
}

/// The published theme and its draft: the body of `GET /api/theme/draft` and
/// of every successful write.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThemeState {
    pub published: ThemeRecord,
    pub draft: ThemeRecord,
    /// Whether the draft's document differs from the published one.
    pub unpublished: bool,
}

/// Body of `PUT /api/theme/draft`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SaveThemeDraftRequest {
    /// The draft revision this change was based on.
    pub revision: u32,
    pub document: ThemeDocument,
}

/// Body of `POST /api/theme/publish` and `POST /api/theme/discard`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ThemeRevisionRequest {
    /// The draft revision the person was looking at.
    pub revision: u32,
}
