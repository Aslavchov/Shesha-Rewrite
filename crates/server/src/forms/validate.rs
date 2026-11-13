//! Structural checks on a form document (ADR 0003): everything that can be
//! judged without knowing a component type. Types, regions and settings are
//! the client's to check.
//!
//! Every problem found is reported, each with the path to it, so a person can
//! fix a document in one pass.

use std::collections::HashMap;

use contracts::{
    ColorValue, ComponentInstance, ErrorDetail, FORM_FORMAT_VERSION, FormDocument, SlotStyle,
};
use serde_json::Value;

const MAX_NAME_CHARS: usize = 200;
const MAX_DESCRIPTION_CHARS: usize = 1000;
/// Longest id, component name, type id, slot name and region name.
const MAX_KEY_CHARS: usize = 64;
const MAX_PATH_CHARS: usize = 255;

/// Checks `document` and, when it is sound, returns it typed.
pub fn validate(document: &Value) -> Result<FormDocument, Vec<ErrorDetail>> {
    if !document.is_object() {
        return Err(vec![ErrorDetail::new(
            "",
            "A form document is a JSON object.",
        )]);
    }
    check_format_version(document)?;

    let parsed: FormDocument = serde_path_to_error::deserialize(document).map_err(|error| {
        let path = error.path().to_string();
        let path = if path == "." { String::new() } else { path };
        vec![ErrorDetail::new(path, sentence(&error.inner().to_string()))]
    })?;

    let mut checker = Checker::default();
    checker.form(&parsed);
    if checker.problems.is_empty() {
        Ok(parsed)
    } else {
        Err(checker.problems)
    }
}

/// The version is checked on the raw JSON, before anything else is read: a
/// document in another format need not have this format's shape at all.
fn check_format_version(document: &Value) -> Result<(), Vec<ErrorDetail>> {
    let problem = match document.get("formatVersion") {
        None => "A form document states its formatVersion.".to_owned(),
        Some(version) => match version.as_u64() {
            Some(version) if version == u64::from(FORM_FORMAT_VERSION) => return Ok(()),
            Some(version) => format!(
                "This build reads format version {FORM_FORMAT_VERSION}; the document is version {version}."
            ),
            None => "formatVersion is a whole number.".to_owned(),
        },
    };
    Err(vec![ErrorDetail::new("formatVersion", problem)])
}

/// What was seen so far, each with the path it was first seen at.
#[derive(Default)]
struct Checker {
    problems: Vec<ErrorDetail>,
    ids: HashMap<String, String>,
    names: HashMap<String, String>,
    /// In document order, for the prefix check.
    binds: Vec<(String, String)>,
}

impl Checker {
    fn problem(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.problems.push(ErrorDetail::new(path, message));
    }

    fn form(&mut self, form: &FormDocument) {
        let name_chars = form.name.chars().count();
        if form.name.trim().is_empty() {
            self.problem("name", "A form needs a name.");
        } else if name_chars > MAX_NAME_CHARS {
            self.problem(
                "name",
                format!("The name is {name_chars} characters long; the limit is {MAX_NAME_CHARS}."),
            );
        }
        let description_chars = form.description.chars().count();
        if description_chars > MAX_DESCRIPTION_CHARS {
            self.problem(
                "description",
                format!(
                    "The description is {description_chars} characters long; the limit is {MAX_DESCRIPTION_CHARS}."
                ),
            );
        }
        self.region("components", &form.components);
    }

    fn region(&mut self, path: &str, instances: &[ComponentInstance]) {
        for (index, instance) in instances.iter().enumerate() {
            self.instance(&format!("{path}[{index}]"), instance);
        }
    }

    fn instance(&mut self, path: &str, instance: &ComponentInstance) {
        self.id(path, &instance.id);
        self.component_type(path, &instance.component_type);
        self.name(path, &instance.name);
        if let Some(bind) = &instance.bind {
            self.bind(path, bind);
        }
        for (slot, style) in &instance.styles {
            let slot_path = format!("{path}.styles.{slot}");
            if !is_key(slot) {
                self.problem(&slot_path, format!("{slot:?} is not a valid slot name."));
            }
            self.style(&slot_path, style);
        }
        for (region, children) in &instance.regions {
            let region_path = format!("{path}.regions.{region}");
            if !is_key(region) {
                self.problem(
                    &region_path,
                    format!("{region:?} is not a valid region name."),
                );
            }
            self.region(&region_path, children);
        }
    }

    fn id(&mut self, path: &str, id: &str) {
        let id_path = format!("{path}.id");
        let well_formed = !id.is_empty()
            && id.len() <= MAX_KEY_CHARS
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if !well_formed {
            self.problem(
                id_path,
                format!(
                    "{id:?} is not a valid id. Use 1 to {MAX_KEY_CHARS} letters, digits, _ or -."
                ),
            );
        } else if let Some(first) = self.ids.get(id) {
            self.problem(id_path, format!("{id:?} is already the id of {first}."));
        } else {
            self.ids.insert(id.to_owned(), path.to_owned());
        }
    }

    fn component_type(&mut self, path: &str, component_type: &str) {
        let mut chars = component_type.chars();
        let well_formed = chars.next().is_some_and(|c| c.is_ascii_lowercase())
            && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            && component_type.len() <= MAX_KEY_CHARS;
        if !well_formed {
            self.problem(
                format!("{path}.type"),
                format!(
                    "{component_type:?} is not a valid component type. Use lowercase letters, digits and hyphens, starting with a letter."
                ),
            );
        }
    }

    fn name(&mut self, path: &str, name: &str) {
        let name_path = format!("{path}.name");
        if !is_identifier(name) || name.len() > MAX_KEY_CHARS {
            self.problem(
                name_path,
                format!(
                    "{name:?} is not a valid name. Use up to {MAX_KEY_CHARS} letters, digits, _ and $, not starting with a digit."
                ),
            );
        } else if let Some(first) = self.names.get(name) {
            self.problem(
                name_path,
                format!("{name:?} is already the name of {first}."),
            );
        } else {
            self.names.insert(name.to_owned(), path.to_owned());
        }
    }

    fn bind(&mut self, path: &str, bind: &str) {
        let bind_path = format!("{path}.bind");
        if bind.len() > MAX_PATH_CHARS || !bind.split('.').all(is_identifier) {
            self.problem(
                bind_path,
                format!(
                    "{bind:?} is not a valid data path. Use names joined by dots, such as contact.preferredMethod."
                ),
            );
            return;
        }
        let mut clash = None;
        for (other, first) in &self.binds {
            if other == bind {
                clash = Some(format!("{bind:?} is already the data path of {first}."));
            } else if is_inside(bind, other) || is_inside(other, bind) {
                clash = Some(format!(
                    "{bind:?} and {other:?} ({first}) cannot both hold a value: one path is inside the other."
                ));
            }
            if clash.is_some() {
                break;
            }
        }
        match clash {
            Some(message) => self.problem(bind_path, message),
            None => self.binds.push((bind.to_owned(), path.to_owned())),
        }
    }

    fn style(&mut self, path: &str, style: &SlotStyle) {
        let colours = [
            ("color", &style.color),
            ("background", &style.background),
            ("borderColor", &style.border_color),
        ];
        for (property, value) in colours {
            let problem = match value {
                Some(ColorValue::Literal(literal)) if !is_hex_colour(literal) => format!(
                    "{literal:?} is not a colour. Write #RRGGBB or #RRGGBBAA, or refer to a token: {{ \"token\": \"primary\" }}."
                ),
                Some(ColorValue::Token(reference)) if !is_token_name(&reference.token) => format!(
                    "{:?} is not a valid token name. Use lowercase letters, digits and hyphens.",
                    reference.token
                ),
                _ => continue,
            };
            self.problem(format!("{path}.{property}"), problem);
        }
    }
}

/// An ASCII JavaScript identifier. Reserved words are fine: names are used as
/// property names (`form.components.<name>`), where every word is allowed.
fn is_identifier(text: &str) -> bool {
    let mut chars = text.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

/// A slot or region name: letters, digits, `_` and `-`, starting with a letter.
fn is_key(text: &str) -> bool {
    let mut chars = text.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && text.len() <= MAX_KEY_CHARS
}

fn is_token_name(text: &str) -> bool {
    let mut chars = text.chars();
    chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && text.len() <= MAX_KEY_CHARS
}

fn is_hex_colour(text: &str) -> bool {
    text.strip_prefix('#').is_some_and(|digits| {
        matches!(digits.len(), 6 | 8) && digits.chars().all(|c| c.is_ascii_hexdigit())
    })
}

/// Whether data path `inner` lies inside `outer` (`a.b` is inside `a`).
fn is_inside(inner: &str, outer: &str) -> bool {
    inner
        .strip_prefix(outer)
        .is_some_and(|rest| rest.starts_with('.'))
}

/// serde's messages start in lower case and have no full stop.
fn sentence(message: &str) -> String {
    let mut chars = message.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let mut sentence: String = first.to_uppercase().chain(chars).collect();
    if !sentence.ends_with('.') {
        sentence.push('.');
    }
    sentence
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn field(id: &str, name: &str, bind: &str) -> Value {
        json!({ "id": id, "type": "text-field", "name": name, "bind": bind })
    }

    fn form(components: Value) -> Value {
        json!({ "formatVersion": 1, "name": "Test", "components": components })
    }

    /// The problems as `(path, message)`, or nothing when the document is valid.
    fn problems(document: Value) -> Vec<(String, String)> {
        match validate(&document) {
            Ok(_) => Vec::new(),
            Err(details) => details.into_iter().map(|d| (d.path, d.message)).collect(),
        }
    }

    fn paths(document: Value) -> Vec<String> {
        problems(document)
            .into_iter()
            .map(|(path, _)| path)
            .collect()
    }

    #[test]
    fn a_minimal_document_is_valid() {
        let document = validate(&form(json!([]))).unwrap();
        assert_eq!(document.name, "Test");
        assert_eq!(document.description, "");
    }

    #[test]
    fn nesting_styles_and_settings_are_read() {
        let document = form(json!([{
            "id": "c_1", "type": "columns", "name": "row",
            "settings": { "columns": 3 },
            "regions": {
                "col1": [{
                    "id": "c_2", "type": "container", "name": "box",
                    "regions": { "content": [field("c_3", "first", "person.first")] }
                }],
                "col2": [{
                    "id": "c_4", "type": "text-field", "name": "second", "bind": "person.second",
                    "styles": {
                        "label": { "color": "#003BB2", "fontWeight": "semibold" },
                        "control": { "background": { "token": "muted" }, "radius": "2xl", "padding": "sm" }
                    }
                }]
            }
        }]));
        assert_eq!(problems(document), []);
    }

    #[test]
    fn the_document_must_be_an_object() {
        assert_eq!(paths(json!([1, 2])), [""]);
    }

    #[test]
    fn format_version_is_required_whole_and_known() {
        for document in [
            json!({ "name": "x", "components": [] }),
            json!({ "formatVersion": "1", "name": "x", "components": [] }),
            json!({ "formatVersion": 1.5, "name": "x", "components": [] }),
            json!({ "formatVersion": 2, "name": "x", "components": [] }),
            json!({ "formatVersion": 0, "name": "x", "components": [] }),
        ] {
            assert_eq!(paths(document.clone()), ["formatVersion"], "{document}");
        }
    }

    #[test]
    fn an_unknown_version_is_reported_before_the_shape() {
        // A future format may not look like this one at all.
        let document = json!({ "formatVersion": 2, "title": "x", "tree": {} });
        let found = problems(document);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "formatVersion");
        assert!(found[0].1.contains("version 2"), "{}", found[0].1);
    }

    #[test]
    fn shape_errors_name_the_path() {
        let document = form(json!([{
            "id": "c_1", "type": "columns", "name": "row",
            "regions": { "col1": [{ "id": "c_2", "type": "text-field" }] }
        }]));
        let found = problems(document);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "components[0].regions.col1[0]");
        assert!(found[0].1.contains("name"), "{}", found[0].1);
    }

    #[test]
    fn unknown_keys_are_refused() {
        assert_eq!(
            paths(json!({ "formatVersion": 1, "name": "x", "components": [], "theme": "dark" })),
            ["theme"]
        );
        let document = form(json!([{ "id": "c_1", "type": "t", "name": "a", "margin": 4 }]));
        assert_eq!(paths(document), ["components[0].margin"]);
    }

    #[test]
    fn styles_take_only_the_fixed_typed_properties() {
        let with_style = |style: Value| {
            form(json!([{
                "id": "c_1", "type": "t", "name": "a", "styles": { "label": style }
            }]))
        };
        assert_eq!(
            paths(with_style(json!({ "margin": "md" }))),
            ["components[0].styles.label.margin"]
        );
        assert_eq!(
            paths(with_style(json!({ "radius": "huge" }))),
            ["components[0].styles.label.radius"]
        );
        assert_eq!(
            paths(with_style(json!({ "padding": 12 }))),
            ["components[0].styles.label.padding"]
        );
        assert_eq!(
            paths(with_style(
                json!({ "color": "red", "background": "#12345", "borderColor": { "token": "Primary Blue" } })
            )),
            [
                "components[0].styles.label.color",
                "components[0].styles.label.background",
                "components[0].styles.label.borderColor",
            ]
        );
        assert_eq!(
            problems(with_style(
                json!({ "color": "#003bb2", "background": "#003BB280" })
            )),
            []
        );
    }

    #[test]
    fn the_form_name_is_required_and_bounded() {
        let named = |name: &str| json!({ "formatVersion": 1, "name": name, "components": [] });
        assert_eq!(paths(named("  ")), ["name"]);
        assert_eq!(paths(named(&"n".repeat(201))), ["name"]);
        assert_eq!(paths(named(&"n".repeat(200))), Vec::<String>::new());

        let described = json!({
            "formatVersion": 1, "name": "x", "description": "d".repeat(1001), "components": []
        });
        assert_eq!(paths(described), ["description"]);
    }

    #[test]
    fn ids_are_well_formed_and_unique_at_any_depth() {
        let document = form(json!([
            field("c_1", "a", "a"),
            { "id": "c_2", "type": "container", "name": "box",
              "regions": { "content": [field("c_1", "b", "b"), field("has space", "c", "c")] } },
            field("", "d", "d"),
        ]));
        let found = problems(document);
        assert_eq!(
            found
                .iter()
                .map(|(path, _)| path.as_str())
                .collect::<Vec<_>>(),
            [
                "components[1].regions.content[0].id",
                "components[1].regions.content[1].id",
                "components[2].id",
            ]
        );
        assert!(found[0].1.contains("components[0]"), "{}", found[0].1);
    }

    #[test]
    fn names_are_identifiers_and_unique_at_any_depth() {
        let document = form(json!([
            field("c_1", "email", "a"),
            { "id": "c_2", "type": "container", "name": "box",
              "regions": { "content": [field("c_3", "email", "b")] } },
            field("c_4", "first name", "c"),
            field("c_5", "1st", "d"),
            field("c_6", "", "e"),
            field("c_7", "$ok_1", "f"),
            field("c_8", "class", "g"),
        ]));
        assert_eq!(
            paths(document),
            [
                "components[1].regions.content[0].name",
                "components[2].name",
                "components[3].name",
                "components[4].name",
            ]
        );
    }

    #[test]
    fn data_paths_are_dotted_identifiers() {
        for bad in ["", "a..b", ".a", "a.", "a b", "a.1b", "a-b", "a[0]"] {
            let document = form(json!([field("c_1", "a", bad)]));
            assert_eq!(paths(document), ["components[0].bind"], "{bad:?}");
        }
        for good in ["a", "contact.preferredMethod", "_a.$b.c9"] {
            let document = form(json!([field("c_1", "a", good)]));
            assert_eq!(problems(document), [], "{good:?}");
        }
    }

    #[test]
    fn data_paths_are_unique_and_never_inside_one_another() {
        let document = form(json!([
            field("c_1", "a", "contact.method"),
            field("c_2", "b", "contact.method"),
            field("c_3", "c", "contact"),
            field("c_4", "d", "contact.method.kind"),
            field("c_5", "e", "contactless"),
            field("c_6", "f", "contact.other"),
        ]));
        let found = problems(document);
        assert_eq!(
            found
                .iter()
                .map(|(path, _)| path.as_str())
                .collect::<Vec<_>>(),
            [
                "components[1].bind",
                "components[2].bind",
                "components[3].bind"
            ]
        );
        assert!(found[0].1.contains("already"), "{}", found[0].1);
        assert!(found[1].1.contains("inside"), "{}", found[1].1);
    }

    #[test]
    fn bind_is_optional_and_may_be_null() {
        let document = form(json!([
            { "id": "c_1", "type": "button", "name": "go" },
            { "id": "c_2", "type": "button", "name": "stop", "bind": null },
        ]));
        assert_eq!(problems(document), []);
    }

    #[test]
    fn type_ids_region_names_and_slot_names_are_checked() {
        let document = form(json!([{
            "id": "c_1", "type": "Text Field", "name": "a",
            "regions": { "bad name": [] },
            "styles": { "1st": {} }
        }]));
        assert_eq!(
            paths(document),
            [
                "components[0].type",
                "components[0].styles.1st",
                "components[0].regions.bad name",
            ]
        );
    }

    #[test]
    fn every_problem_is_reported_at_once() {
        let document = json!({
            "formatVersion": 1, "name": "",
            "components": [field("c_1", "a b", "x"), field("c_1", "ok", "x")]
        });
        assert_eq!(
            paths(document),
            [
                "name",
                "components[0].name",
                "components[1].id",
                "components[1].bind"
            ]
        );
    }

    #[test]
    fn the_seeded_demo_form_is_valid() {
        let document = crate::forms::seed::person_details();
        let parsed = validate(&document).unwrap_or_else(|problems| panic!("{problems:?}"));
        assert_eq!(parsed.name, "Person details");
    }
}
