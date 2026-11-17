//! Checks on an entity or reference list definition by itself (ADR 0011):
//! names, lengths, limits that fit their type, and that what a definition
//! names exists. Whether a change fits the rows already stored is `schema.rs`.
//!
//! Every problem found is reported, each with the path to it.

use std::collections::{BTreeSet, HashMap};

use contracts::{
    DEFINITION_MAX_DISPLAY_NAME_CHARS, DEFINITION_MAX_HELP_TEXT_CHARS, DEFINITION_MAX_NAME_CHARS,
    ENTITY_MAX_PROPERTIES, EntityDefinition, ErrorDetail, PropertyDefinition, PropertyType,
    REFERENCE_LIST_MAX_ITEMS, ReferenceListDefinition, SYSTEM_PROPERTIES, TEXT_MAX_LENGTH,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::api::parse_problem;

/// The largest whole number a JSON number holds exactly.
pub const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// What a definition may name: everything else that exists.
pub struct Known<'a> {
    pub entities: BTreeSet<&'a str>,
    pub lists: BTreeSet<&'a str>,
    pub forms: BTreeSet<&'a str>,
}

/// Checks an entity definition and, when it is sound, returns it typed.
pub fn entity(document: &Value, known: &Known) -> Result<EntityDefinition, Vec<ErrorDetail>> {
    let definition: EntityDefinition = parse(document, "An entity definition is a JSON object.")?;
    let mut checker = Checker::default();
    checker.entity(&definition, known);
    checker.finish(definition)
}

/// Checks a reference list definition and, when it is sound, returns it typed.
pub fn reference_list(document: &Value) -> Result<ReferenceListDefinition, Vec<ErrorDetail>> {
    let definition: ReferenceListDefinition =
        parse(document, "A reference list definition is a JSON object.")?;
    let mut checker = Checker::default();
    checker.list(&definition);
    checker.finish(definition)
}

fn parse<T: DeserializeOwned>(document: &Value, not_object: &str) -> Result<T, Vec<ErrorDetail>> {
    if !document.is_object() {
        return Err(vec![ErrorDetail::new("", not_object)]);
    }
    serde_path_to_error::deserialize(document).map_err(|error| vec![parse_problem(&error)])
}

/// A name used in the API and in data paths: ASCII letters, digits and `_`,
/// starting with a letter.
pub fn is_name(text: &str) -> bool {
    let mut chars = text.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        && text.len() <= DEFINITION_MAX_NAME_CHARS as usize
}

/// A reference list item's value: as a name, and `-` is allowed too.
fn is_item_value(text: &str) -> bool {
    let mut chars = text.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && text.len() <= DEFINITION_MAX_NAME_CHARS as usize
}

/// Whether `text` is a real calendar date written "YYYY-MM-DD" (ADR 0005).
pub fn is_iso_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &text[range];
        part.bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    let (Some(year), Some(month), Some(day)) = (number(0..4), number(5..7), number(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1..=12 => 31,
        _ => return false,
    };
    year >= 1 && (1..=days).contains(&day)
}

const NAME_RULE: &str = "Use letters, digits and _, starting with a letter, at most 64 characters.";

#[derive(Default)]
struct Checker {
    problems: Vec<ErrorDetail>,
}

impl Checker {
    fn problem(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.problems.push(ErrorDetail::new(path, message));
    }

    fn finish<T>(self, definition: T) -> Result<T, Vec<ErrorDetail>> {
        if self.problems.is_empty() {
            Ok(definition)
        } else {
            Err(self.problems)
        }
    }

    fn name(&mut self, path: &str, name: &str, what: &str) {
        if !is_name(name) {
            self.problem(
                path,
                format!("{name:?} is not a valid name for {what}. {NAME_RULE}"),
            );
        }
    }

    fn display_name(&mut self, path: &str, text: &str, what: &str) {
        let chars = text.chars().count();
        if text.trim().is_empty() {
            self.problem(path, format!("{what} needs a display name."));
        } else if chars > DEFINITION_MAX_DISPLAY_NAME_CHARS as usize {
            self.problem(
                path,
                format!(
                    "The display name is {chars} characters long; the limit is {DEFINITION_MAX_DISPLAY_NAME_CHARS}."
                ),
            );
        }
    }

    fn entity(&mut self, entity: &EntityDefinition, known: &Known) {
        self.name("name", &entity.name, "an entity");
        self.display_name("displayName", &entity.display_name, "An entity");

        if entity.properties.len() > ENTITY_MAX_PROPERTIES as usize {
            self.problem(
                "properties",
                format!(
                    "An entity has at most {ENTITY_MAX_PROPERTIES} properties; this one has {}.",
                    entity.properties.len()
                ),
            );
        }
        // Compared without case: `Email` beside `email` would only confuse.
        let mut seen: HashMap<String, usize> = HashMap::new();
        for (index, property) in entity.properties.iter().enumerate() {
            let path = format!("properties[{index}]");
            self.property(&path, property, entity, known);
            if let Some(first) = seen.insert(property.name.to_ascii_lowercase(), index) {
                self.problem(
                    format!("{path}.name"),
                    format!(
                        "{:?} is already the name of properties[{first}].",
                        property.name
                    ),
                );
            }
        }

        if let Some(display) = &entity.display_property {
            match entity.properties.iter().find(|p| &p.name == display) {
                None => self.problem(
                    "displayProperty",
                    format!("There is no property named {display:?} to show rows by."),
                ),
                Some(property) if property.property_type != PropertyType::Text => self.problem(
                    "displayProperty",
                    format!(
                        "{} is a {} property; rows are shown by a text property.",
                        property.display_name,
                        property.property_type.word()
                    ),
                ),
                Some(_) => {}
            }
        }
        if let Some(form) = &entity.default_form
            && !known.forms.contains(form.as_str())
        {
            self.problem(
                "defaultForm",
                format!("There is no form with the id {form}."),
            );
        }
    }

    fn property(
        &mut self,
        path: &str,
        property: &PropertyDefinition,
        entity: &EntityDefinition,
        known: &Known,
    ) {
        use PropertyType::{Boolean, Date, Number, Reference, ReferenceList, Text};
        let kind = property.property_type;

        self.name(&format!("{path}.name"), &property.name, "a property");
        if SYSTEM_PROPERTIES.contains(&property.name.as_str()) {
            self.problem(
                format!("{path}.name"),
                format!(
                    "Every row already has {:?}; choose another name.",
                    property.name
                ),
            );
        }
        self.display_name(
            &format!("{path}.displayName"),
            &property.display_name,
            "A property",
        );
        let help_chars = property.help_text.chars().count();
        if help_chars > DEFINITION_MAX_HELP_TEXT_CHARS as usize {
            self.problem(
                format!("{path}.helpText"),
                format!(
                    "The help text is {help_chars} characters long; the limit is {DEFINITION_MAX_HELP_TEXT_CHARS}."
                ),
            );
        }
        if kind == Boolean && property.required {
            self.problem(
                format!("{path}.required"),
                "A yes/no property always has a value, so it cannot be required.",
            );
        }

        // A limit that belongs to another type is a mistake, not noise.
        let misplaced = |checker: &mut Self, key: &str, set: bool, owner: PropertyType| {
            if set && kind != owner {
                checker.problem(
                    format!("{path}.{key}"),
                    format!(
                        "{key} is a limit of {} properties; this one is a {} property.",
                        owner.word(),
                        kind.word()
                    ),
                );
            }
        };
        misplaced(self, "maxLength", property.max_length.is_some(), Text);
        misplaced(self, "multiline", property.multiline, Text);
        misplaced(self, "whole", property.whole, Number);
        misplaced(self, "min", property.min.is_some(), Number);
        misplaced(self, "max", property.max.is_some(), Number);
        misplaced(self, "earliest", property.earliest.is_some(), Date);
        misplaced(self, "latest", property.latest.is_some(), Date);
        misplaced(
            self,
            "referenceList",
            property.reference_list.is_some(),
            ReferenceList,
        );
        misplaced(self, "entity", property.entity.is_some(), Reference);

        match kind {
            Text => {
                if let Some(max) = property.max_length
                    && !(1..=TEXT_MAX_LENGTH).contains(&max)
                {
                    self.problem(
                        format!("{path}.maxLength"),
                        format!("The maximum length is from 1 to {TEXT_MAX_LENGTH}."),
                    );
                }
            }
            Number => {
                for (key, limit) in [("min", property.min), ("max", property.max)] {
                    let Some(limit) = limit else { continue };
                    if !limit.is_finite() || limit.abs() > MAX_SAFE_INTEGER {
                        self.problem(format!("{path}.{key}"), "That number is too large.");
                    } else if property.whole && limit.fract() != 0.0 {
                        self.problem(
                            format!("{path}.{key}"),
                            "A whole-number property has whole-number limits.",
                        );
                    }
                }
                if let (Some(min), Some(max)) = (property.min, property.max)
                    && min > max
                {
                    self.problem(
                        format!("{path}.min"),
                        "The minimum cannot be above the maximum.",
                    );
                }
            }
            Date => {
                for (key, limit) in [
                    ("earliest", &property.earliest),
                    ("latest", &property.latest),
                ] {
                    if let Some(limit) = limit
                        && !is_iso_date(limit)
                    {
                        self.problem(
                            format!("{path}.{key}"),
                            format!("{limit:?} is not a date. Write it as YYYY-MM-DD."),
                        );
                    }
                }
                if let (Some(earliest), Some(latest)) = (&property.earliest, &property.latest)
                    && is_iso_date(earliest)
                    && is_iso_date(latest)
                    && earliest > latest
                {
                    self.problem(
                        format!("{path}.earliest"),
                        "The earliest date cannot be after the latest.",
                    );
                }
            }
            ReferenceList => match &property.reference_list {
                None => self.problem(
                    format!("{path}.referenceList"),
                    "A reference list property names the list its values come from.",
                ),
                Some(list) if !known.lists.contains(list.as_str()) => self.problem(
                    format!("{path}.referenceList"),
                    format!("There is no reference list named {list}."),
                ),
                Some(_) => {}
            },
            Reference => match &property.entity {
                None => self.problem(
                    format!("{path}.entity"),
                    "A reference property names the entity its rows are chosen from.",
                ),
                // An entity may refer to itself, even while it is being created.
                Some(target)
                    if target != &entity.name && !known.entities.contains(target.as_str()) =>
                {
                    self.problem(
                        format!("{path}.entity"),
                        format!("There is no entity named {target}."),
                    );
                }
                Some(_) => {}
            },
            Boolean => {}
        }
    }

    fn list(&mut self, list: &ReferenceListDefinition) {
        self.name("name", &list.name, "a reference list");
        self.display_name("displayName", &list.display_name, "A reference list");
        if list.items.len() > REFERENCE_LIST_MAX_ITEMS as usize {
            self.problem(
                "items",
                format!(
                    "A reference list has at most {REFERENCE_LIST_MAX_ITEMS} items; this one has {}.",
                    list.items.len()
                ),
            );
        }
        let mut seen: HashMap<&str, usize> = HashMap::new();
        for (index, item) in list.items.iter().enumerate() {
            let path = format!("items[{index}]");
            if !is_item_value(&item.value) {
                self.problem(
                    format!("{path}.value"),
                    format!(
                        "{:?} is not a valid value. Use letters, digits, _ and -, starting with a letter, at most 64 characters.",
                        item.value
                    ),
                );
            }
            if let Some(first) = seen.insert(item.value.as_str(), index) {
                self.problem(
                    format!("{path}.value"),
                    format!("{:?} is already the value of items[{first}].", item.value),
                );
            }
            let chars = item.label.chars().count();
            if item.label.trim().is_empty() {
                self.problem(format!("{path}.label"), "An item needs a label.");
            } else if chars > DEFINITION_MAX_DISPLAY_NAME_CHARS as usize {
                self.problem(
                    format!("{path}.label"),
                    format!(
                        "The label is {chars} characters long; the limit is {DEFINITION_MAX_DISPLAY_NAME_CHARS}."
                    ),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_are_real_calendar_days() {
        for date in ["2024-02-29", "2000-02-29", "1999-12-31", "0001-01-01"] {
            assert!(is_iso_date(date), "{date}");
        }
        for date in [
            "2023-02-29",
            "1900-02-29",
            "2024-13-01",
            "2024-00-10",
            "2024-04-31",
            "2024-1-01",
            "24-01-01",
            "2024/01/01",
            "0000-01-01",
            "2024-01-0a",
            "",
        ] {
            assert!(!is_iso_date(date), "{date}");
        }
    }

    #[test]
    fn names_are_plain_identifiers() {
        for name in ["person", "firstName", "a1_b", "A"] {
            assert!(is_name(name), "{name}");
        }
        for name in [
            "",
            "1st",
            "_x",
            "first name",
            "naïve",
            "a-b",
            "a;b",
            &"x".repeat(65),
        ] {
            assert!(!is_name(name), "{name}");
        }
    }
}
