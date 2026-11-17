//! One value of one property: checking what a request sent against the
//! property's type and limits (spec section 4, "Server validation"), and
//! turning it into what its column stores.

use contracts::{PropertyDefinition, PropertyType, TEXT_MAX_LENGTH};
use serde_json::{Number, Value};
use sqlx::{QueryBuilder, Sqlite};

use crate::entities::catalog::Catalog;
use crate::entities::validate::{MAX_SAFE_INTEGER, is_iso_date};

/// What a column holds for one row.
#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    Null,
    /// Text, a date, a reference list value or a referenced row's id.
    Text(String),
    /// A number, whole or not.
    Real(f64),
    /// Yes/no, as 1 or 0.
    Int(i64),
}

impl Cell {
    /// Adds the cell to a statement as a bound parameter. Values never
    /// become part of the SQL text.
    pub fn bind(&self, builder: &mut QueryBuilder<Sqlite>) {
        match self {
            Self::Null => builder.push_bind(None::<String>),
            Self::Text(text) => builder.push_bind(text.clone()),
            Self::Real(number) => builder.push_bind(*number),
            Self::Int(number) => builder.push_bind(*number),
        };
    }

    /// The cell as the API returns it (ADR 0005): `null` for no value, and a
    /// whole number without a fraction.
    pub fn to_json(&self, property: &PropertyDefinition) -> Value {
        match self {
            Self::Null if property.property_type == PropertyType::Boolean => Value::Bool(false),
            Self::Null => Value::Null,
            Self::Text(text) => Value::String(text.clone()),
            Self::Real(number) => number_json(*number),
            Self::Int(number) if property.property_type == PropertyType::Boolean => {
                Value::Bool(*number != 0)
            }
            Self::Int(number) => Value::Number((*number).into()),
        }
    }

    /// Whether a required property would count this as missing.
    pub fn is_missing(&self) -> bool {
        match self {
            Self::Null => true,
            Self::Text(text) => text.trim().is_empty(),
            Self::Real(_) | Self::Int(_) => false,
        }
    }
}

/// A stored number as JSON: `3`, not `3.0`, when it is whole.
fn number_json(number: f64) -> Value {
    if number.fract() == 0.0 && number.abs() <= MAX_SAFE_INTEGER {
        // The cast is exact: the value is whole and within 2^53.
        #[expect(clippy::cast_possible_truncation)]
        Value::Number((number as i64).into())
    } else {
        Number::from_f64(number).map_or(Value::Null, Value::Number)
    }
}

/// The SQLite type of a property's column.
pub fn column_type(kind: PropertyType) -> &'static str {
    match kind {
        PropertyType::Number => "REAL",
        PropertyType::Boolean => "INTEGER",
        PropertyType::Text
        | PropertyType::Date
        | PropertyType::ReferenceList
        | PropertyType::Reference => "TEXT",
    }
}

/// Checks `value` against `property` and returns what to store, or why it
/// cannot be stored, in words for the person who typed it.
///
/// Two things are left to the caller, which has the database: that a
/// required property has a value, and that a referenced row exists.
/// `current` is what the row holds now, if it exists: a retired reference
/// list item may stay, but not be newly chosen.
pub fn check(
    property: &PropertyDefinition,
    value: &Value,
    catalog: &Catalog,
    current: Option<&Cell>,
) -> Result<Cell, String> {
    use PropertyType::{Boolean, Date, Number, Reference, ReferenceList, Text};
    let kind = property.property_type;

    if value.is_null() {
        return Ok(if kind == Boolean {
            Cell::Int(0)
        } else {
            Cell::Null
        });
    }

    match kind {
        Text => {
            let Some(text) = value.as_str() else {
                return Err("Enter text".to_owned());
            };
            // An empty string is no value (ADR 0005).
            if text.is_empty() {
                return Ok(Cell::Null);
            }
            let max = property.max_length.unwrap_or(TEXT_MAX_LENGTH) as usize;
            if text.chars().count() > max {
                return Err(format!("Enter no more than {max} characters"));
            }
            if !property.multiline && text.contains(['\n', '\r']) {
                return Err("Enter a single line of text".to_owned());
            }
            Ok(Cell::Text(text.to_owned()))
        }
        Number => {
            let number = value
                .as_f64()
                .filter(|number| value.is_number() && number.is_finite());
            let Some(number) = number else {
                return Err("Enter a number".to_owned());
            };
            if number.abs() > MAX_SAFE_INTEGER {
                return Err("That number is too large".to_owned());
            }
            if property.whole && number.fract() != 0.0 {
                return Err("Enter a whole number".to_owned());
            }
            if let Some(min) = property.min
                && number < min
            {
                return Err(format!(
                    "Enter a number that is {} or more",
                    number_json(min)
                ));
            }
            if let Some(max) = property.max
                && number > max
            {
                return Err(format!(
                    "Enter a number that is {} or less",
                    number_json(max)
                ));
            }
            Ok(Cell::Real(number))
        }
        Boolean => match value {
            Value::Bool(flag) => Ok(Cell::Int(i64::from(*flag))),
            _ => Err("Choose yes or no".to_owned()),
        },
        Date => {
            let date = value.as_str().filter(|text| is_iso_date(text));
            let Some(date) = date else {
                return Err("Enter a date as YYYY-MM-DD".to_owned());
            };
            // "YYYY-MM-DD" sorts as text in calendar order.
            if let Some(earliest) = &property.earliest
                && date < earliest.as_str()
            {
                return Err(format!("Enter a date on or after {earliest}"));
            }
            if let Some(latest) = &property.latest
                && date > latest.as_str()
            {
                return Err(format!("Enter a date on or before {latest}"));
            }
            Ok(Cell::Text(date.to_owned()))
        }
        ReferenceList => {
            let Some(chosen) = value.as_str() else {
                return Err("Choose one of the list's items".to_owned());
            };
            let list = catalog.list_of(property);
            let item = list.and_then(|list| list.item(chosen));
            let list_name = list.map_or("the list", |list| list.definition.display_name.as_str());
            match item {
                None => Err(format!("{list_name} has no item {chosen:?}")),
                // A retired item stays where it is, but is not chosen anew.
                Some(item)
                    if item.retired
                        && !matches!(current, Some(Cell::Text(held)) if held == chosen) =>
                {
                    Err(format!(
                        "{} is retired and can no longer be chosen",
                        item.label
                    ))
                }
                Some(_) => Ok(Cell::Text(chosen.to_owned())),
            }
        }
        Reference => match value.as_str() {
            Some(id) if !id.is_empty() => Ok(Cell::Text(id.to_owned())),
            _ => Err("Choose a row by its id".to_owned()),
        },
    }
}

/// The message of a required property left without a value. The same words
/// as the form's own rule (ADR 0005).
pub const REQUIRED: &str = "This field is required";
