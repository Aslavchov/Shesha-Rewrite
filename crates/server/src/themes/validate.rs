//! Structural checks on a theme document (ADR 0010): the format version,
//! colour values, the known members and their allowed values, and size
//! limits. Component types and slot names are the client's to know: any
//! well-formed one is accepted and kept.
//!
//! The checks read the JSON as it was sent, so every problem found is
//! reported, each with the path to it, and a person can fix a theme in one
//! pass.

use contracts::{
    ErrorDetail, THEME_COLOR_ROLES, THEME_FORMAT_VERSION, THEME_MAX_COMPONENTS, THEME_MAX_SLOTS,
    THEME_RADIUS_MAX, THEME_RADIUS_MIN, THEME_TEXT_SIZE_MAX, THEME_TEXT_SIZE_MIN, ThemeDocument,
};
use serde_json::{Map, Value};

use crate::forms::validate::slot_style_problems;

/// Longest component type and slot name.
const MAX_KEY_CHARS: usize = 64;

/// The names `contracts::Density` is written as. A test keeps them in step.
const DENSITIES: [&str; 3] = ["compact", "regular", "comfortable"];

/// The two modes a colour role has a value for.
const MODES: [&str; 2] = ["light", "dark"];

/// Checks `document`: nothing when it is sound, otherwise every problem.
pub fn validate(document: &Value) -> Result<(), Vec<ErrorDetail>> {
    let Some(theme) = document.as_object() else {
        return Err(vec![ErrorDetail::new("", "A theme is a JSON object.")]);
    };
    check_format_version(theme)?;

    let mut checker = Checker::default();
    checker.theme(theme);
    if checker.problems.is_empty() {
        // Whatever passes the checks above must also be a `ThemeDocument`.
        // Should the two ever disagree, the theme is refused, not stored.
        if let Err(error) = serde_path_to_error::deserialize::<_, ThemeDocument>(document) {
            let path = error.path().to_string();
            let path = if path == "." { String::new() } else { path };
            checker.problem(
                path,
                format!("The theme cannot be read: {}.", error.inner()),
            );
        }
    }
    if checker.problems.is_empty() {
        Ok(())
    } else {
        Err(checker.problems)
    }
}

/// The version is checked before anything else is read: a theme in another
/// format need not have this format's shape at all.
fn check_format_version(theme: &Map<String, Value>) -> Result<(), Vec<ErrorDetail>> {
    let problem = match theme.get("formatVersion") {
        None => "A theme states its formatVersion.".to_owned(),
        Some(version) => match version.as_u64() {
            Some(version) if version == u64::from(THEME_FORMAT_VERSION) => return Ok(()),
            Some(version) => format!(
                "This build reads theme format version {THEME_FORMAT_VERSION}; the theme is version {version}."
            ),
            None => "formatVersion is a whole number.".to_owned(),
        },
    };
    Err(vec![ErrorDetail::new("formatVersion", problem)])
}

#[derive(Default)]
struct Checker {
    problems: Vec<ErrorDetail>,
}

impl Checker {
    fn problem(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.problems.push(ErrorDetail::new(path, message));
    }

    fn theme(&mut self, theme: &Map<String, Value>) {
        for (key, value) in theme {
            match key.as_str() {
                "formatVersion" => {}
                "colors" => self.colors(value),
                "radius" => self.pixels(
                    key,
                    value,
                    "a radius",
                    THEME_RADIUS_MIN,
                    THEME_RADIUS_MAX,
                ),
                "textSize" => self.pixels(
                    key,
                    value,
                    "a text size",
                    THEME_TEXT_SIZE_MIN,
                    THEME_TEXT_SIZE_MAX,
                ),
                "density" => self.density(value),
                "components" => self.components(value),
                _ => self.problem(
                    key,
                    format!(
                        "{key:?} is not part of a theme. A theme has formatVersion, colors, radius, textSize, density and components."
                    ),
                ),
            }
        }
    }

    fn colors(&mut self, colors: &Value) {
        let Some(colors) = colors.as_object() else {
            self.problem(
                "colors",
                "colors is an object of colour roles, such as { \"primary\": { \"light\": \"#003BB2\" } }.",
            );
            return;
        };
        for (role, value) in colors {
            let path = format!("colors.{role}");
            if !THEME_COLOR_ROLES.contains(&role.as_str()) {
                self.problem(
                    path,
                    format!(
                        "{role:?} is not a colour role. The roles are {}.",
                        list(&THEME_COLOR_ROLES, "and")
                    ),
                );
                continue;
            }
            let Some(modes) = value.as_object() else {
                self.problem(
                    path,
                    "A colour role is an object with a light and a dark colour, such as { \"light\": \"#003BB2\" }.",
                );
                continue;
            };
            for (mode, colour) in modes {
                let path = format!("{path}.{mode}");
                if !MODES.contains(&mode.as_str()) {
                    self.problem(
                        path,
                        format!("{mode:?} is not part of a colour role. Use light and dark."),
                    );
                } else if !colour.as_str().is_some_and(is_opaque_hex_colour) {
                    self.problem(
                        path,
                        format!("{colour} is not a colour. Use six hex digits, like #003BB2."),
                    );
                }
            }
        }
    }

    /// A whole number of pixels from `min` to `max`.
    fn pixels(&mut self, path: &str, value: &Value, what: &str, min: u32, max: u32) {
        let in_range = value
            .as_u64()
            .is_some_and(|pixels| (u64::from(min)..=u64::from(max)).contains(&pixels));
        if !in_range {
            self.problem(
                path,
                format!("{value} is not {what}. Use a whole number of pixels from {min} to {max}."),
            );
        }
    }

    fn density(&mut self, density: &Value) {
        if !density
            .as_str()
            .is_some_and(|name| DENSITIES.contains(&name))
        {
            self.problem(
                "density",
                format!(
                    "{density} is not a density. Use {}.",
                    list(&DENSITIES, "or")
                ),
            );
        }
    }

    fn components(&mut self, components: &Value) {
        let Some(components) = components.as_object() else {
            self.problem(
                "components",
                "components is an object of component types, each with the styles of its slots.",
            );
            return;
        };
        if components.len() > THEME_MAX_COMPONENTS as usize {
            self.problem(
                "components",
                format!(
                    "The theme styles {} component types; the limit is {THEME_MAX_COMPONENTS}.",
                    components.len()
                ),
            );
        }
        for (component_type, slots) in components {
            let path = format!("components.{component_type}");
            if !is_key(component_type) {
                self.problem(
                    &path,
                    format!(
                        "{component_type:?} is not a valid component type. Use 1 to {MAX_KEY_CHARS} letters, digits, _ or -."
                    ),
                );
            }
            let Some(slots) = slots.as_object() else {
                self.problem(
                    path,
                    "A component's styles are an object of slots, such as { \"root\": { \"background\": \"#003BB2\" } }.",
                );
                continue;
            };
            if slots.len() > THEME_MAX_SLOTS as usize {
                self.problem(
                    &path,
                    format!(
                        "{component_type:?} has styles for {} slots; the limit is {THEME_MAX_SLOTS}.",
                        slots.len()
                    ),
                );
            }
            for (slot, style) in slots {
                let path = format!("{path}.{slot}");
                if !is_key(slot) {
                    self.problem(
                        &path,
                        format!(
                            "{slot:?} is not a valid slot name. Use 1 to {MAX_KEY_CHARS} letters, digits, _ or -."
                        ),
                    );
                }
                // The same check as for an instance's slot style in a form.
                slot_style_problems(&path, style, &mut self.problems);
            }
        }
    }
}

/// A component type or slot name: 1 to 64 letters, digits, `_` and `-`.
fn is_key(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_KEY_CHARS
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// `#RRGGBB`. A theme colour has no alpha: text is chosen to contrast with
/// it, which needs to know the colour that is actually seen.
fn is_opaque_hex_colour(text: &str) -> bool {
    text.strip_prefix('#')
        .is_some_and(|digits| digits.len() == 6 && digits.chars().all(|c| c.is_ascii_hexdigit()))
}

/// `a, b and c`.
fn list(names: &[&str], last_joiner: &str) -> String {
    match names {
        [] => String::new(),
        [only] => (*only).to_owned(),
        [rest @ .., last] => format!("{} {last_joiner} {last}", rest.join(", ")),
    }
}

#[cfg(test)]
mod tests {
    use contracts::Density;
    use serde_json::json;

    use super::*;

    /// The problems as `(path, message)`, or nothing when the theme is valid.
    fn problems(document: Value) -> Vec<(String, String)> {
        match validate(&document) {
            Ok(()) => Vec::new(),
            Err(details) => details.into_iter().map(|d| (d.path, d.message)).collect(),
        }
    }

    fn paths(document: Value) -> Vec<String> {
        problems(document)
            .into_iter()
            .map(|(path, _)| path)
            .collect()
    }

    /// A theme with `members` beside its format version.
    fn theme(members: Value) -> Value {
        let mut theme = json!({ "formatVersion": 1 });
        for (key, value) in members.as_object().unwrap() {
            theme[key] = value.clone();
        }
        theme
    }

    #[test]
    fn the_empty_theme_is_valid() {
        assert_eq!(problems(json!({ "formatVersion": 1 })), []);
    }

    #[test]
    fn a_full_theme_is_valid() {
        let document = theme(json!({
            "colors": {
                "primary": { "light": "#0F766E", "dark": "#5eead4" },
                "destructive": { "light": "#B91C1C" },
                "success": { "dark": "#15803D" },
                "warning": { "light": "#B45309" },
                "info": { "light": "#0369A1" },
                "background": { "light": "#FFFFFF" },
                "sidebar": { "light": "#F5F5F5" },
            },
            "radius": 12,
            "textSize": 15,
            "density": "compact",
            "components": {
                "button": {
                    "root": { "background": { "token": "success" }, "radius": "full" },
                },
                "text-field": {
                    "label": { "color": "#003BB280", "fontWeight": "semibold" },
                    "control": { "borderColor": "#003bb2", "padding": "sm" },
                },
            },
        }));
        assert_eq!(problems(document), []);
    }

    #[test]
    fn empty_objects_are_valid() {
        for members in [
            json!({ "colors": {} }),
            json!({ "colors": { "primary": {} } }),
            json!({ "components": {} }),
            json!({ "components": { "button": {} } }),
            json!({ "components": { "button": { "root": {} } } }),
        ] {
            assert_eq!(problems(theme(members.clone())), [], "{members}");
        }
    }

    #[test]
    fn the_theme_must_be_an_object() {
        for document in [json!([1, 2]), json!("theme"), json!(null)] {
            assert_eq!(paths(document), [""]);
        }
    }

    #[test]
    fn format_version_is_required_whole_and_known() {
        for document in [
            json!({}),
            json!({ "formatVersion": "1" }),
            json!({ "formatVersion": 1.5 }),
            json!({ "formatVersion": null }),
            json!({ "formatVersion": 2 }),
            json!({ "formatVersion": 0 }),
        ] {
            assert_eq!(paths(document.clone()), ["formatVersion"], "{document}");
        }
    }

    #[test]
    fn an_unknown_version_is_reported_before_the_shape() {
        // A future format may not look like this one at all.
        let found = problems(json!({ "formatVersion": 2, "palette": [], "radius": "big" }));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "formatVersion");
        assert!(found[0].1.contains("version 2"), "{}", found[0].1);
    }

    #[test]
    fn unknown_members_are_refused() {
        assert_eq!(
            paths(theme(json!({ "font": "Arial", "name": "Mine" }))),
            ["font", "name"]
        );
    }

    #[test]
    fn colour_roles_are_the_seven_known_ones() {
        let found = problems(theme(json!({
            "colors": { "accent": { "light": "#003BB2" }, "Primary": {}, "primary": {} }
        })));
        assert_eq!(
            found
                .iter()
                .map(|(path, _)| path.as_str())
                .collect::<Vec<_>>(),
            ["colors.accent", "colors.Primary"]
        );
        assert_eq!(
            found[0].1,
            "\"accent\" is not a colour role. The roles are primary, destructive, success, warning, info, background and sidebar."
        );
    }

    #[test]
    fn colors_and_each_role_are_objects_of_light_and_dark() {
        assert_eq!(paths(theme(json!({ "colors": "#003BB2" }))), ["colors"]);
        assert_eq!(paths(theme(json!({ "colors": null }))), ["colors"]);
        assert_eq!(
            paths(theme(
                json!({ "colors": { "primary": "#003BB2", "info": null } })
            )),
            ["colors.primary", "colors.info"]
        );
        assert_eq!(
            paths(theme(json!({
                "colors": { "primary": { "light": "#003BB2", "medium": "#003BB2", "Dark": "#003BB2" } }
            }))),
            ["colors.primary.medium", "colors.primary.Dark"]
        );
    }

    #[test]
    fn a_theme_colour_is_exactly_six_hex_digits() {
        let bad = [
            json!("blue"),
            json!("#003BB"),
            json!("#003BB2FF"),
            json!("#03B"),
            json!("003BB2"),
            json!("#003BBG"),
            json!("#003BB2 "),
            json!(""),
            json!("</script>"),
            json!({ "token": "primary" }),
            json!(15282),
            json!(null),
        ];
        for colour in bad {
            let document = theme(json!({ "colors": { "primary": { "light": colour } } }));
            assert_eq!(paths(document), ["colors.primary.light"], "{colour}");
            let document = theme(json!({ "colors": { "sidebar": { "dark": colour } } }));
            assert_eq!(paths(document), ["colors.sidebar.dark"], "{colour}");
        }
        for colour in ["#003BB2", "#003bb2", "#aBcDeF", "#000000"] {
            let document = theme(json!({ "colors": { "primary": { "light": colour } } }));
            assert_eq!(problems(document), [], "{colour}");
        }
    }

    #[test]
    fn a_colour_problem_says_what_is_allowed() {
        let found = problems(theme(
            json!({ "colors": { "primary": { "light": "blue" } } }),
        ));
        assert_eq!(
            found,
            [(
                "colors.primary.light".to_owned(),
                "\"blue\" is not a colour. Use six hex digits, like #003BB2.".to_owned()
            )]
        );
    }

    #[test]
    fn radius_and_text_size_are_whole_numbers_in_range() {
        for (member, min, max) in [
            ("radius", THEME_RADIUS_MIN, THEME_RADIUS_MAX),
            ("textSize", THEME_TEXT_SIZE_MIN, THEME_TEXT_SIZE_MAX),
        ] {
            for good in [min, max] {
                assert_eq!(
                    problems(theme(json!({ member: good }))),
                    [],
                    "{member} {good}"
                );
            }
            let mut bad = vec![
                json!(max + 1),
                json!(-1),
                json!(14.5),
                json!("14"),
                json!(null),
                json!(true),
            ];
            if min > 0 {
                bad.push(json!(min - 1));
            }
            for value in bad {
                assert_eq!(
                    paths(theme(json!({ member: value }))),
                    [member],
                    "{member} {value}"
                );
            }
        }
        assert_eq!(
            problems(theme(json!({ "radius": 20 }))),
            [(
                "radius".to_owned(),
                "20 is not a radius. Use a whole number of pixels from 0 to 16.".to_owned()
            )]
        );
    }

    #[test]
    fn density_is_one_of_the_named_steps() {
        for name in DENSITIES {
            assert_eq!(problems(theme(json!({ "density": name }))), [], "{name}");
            // The list here is the contract's.
            assert!(serde_json::from_value::<Density>(json!(name)).is_ok());
        }
        for bad in [json!("tight"), json!("Regular"), json!(1), json!(null)] {
            assert_eq!(
                paths(theme(json!({ "density": bad }))),
                ["density"],
                "{bad}"
            );
        }
        assert_eq!(
            problems(theme(json!({ "density": "tight" })))[0].1,
            "\"tight\" is not a density. Use compact, regular or comfortable."
        );
    }

    #[test]
    fn any_well_formed_component_type_and_slot_name_is_accepted() {
        let document = theme(json!({
            "components": {
                "not-registered": { "root": { "background": "#003BB2" } },
                "Fancy_Widget-2": { "9th": {}, "inner_part": {} },
                "x".repeat(64): { "y".repeat(64): {} },
            }
        }));
        assert_eq!(problems(document), []);
    }

    #[test]
    fn component_types_and_slot_names_are_well_formed() {
        let document = theme(json!({
            "components": {
                "": {},
                "text field": {},
                "x".repeat(65): {},
                "button": { "": {}, "the root": {}, "y".repeat(65): {}, "ro.ot": {} },
            }
        }));
        assert_eq!(
            paths(document),
            [
                "components.".to_owned(),
                "components.text field".to_owned(),
                format!("components.{}", "x".repeat(65)),
                "components.button.".to_owned(),
                "components.button.the root".to_owned(),
                format!("components.button.{}", "y".repeat(65)),
                "components.button.ro.ot".to_owned(),
            ]
        );
    }

    #[test]
    fn components_and_each_component_are_objects() {
        assert_eq!(paths(theme(json!({ "components": [] }))), ["components"]);
        assert_eq!(
            paths(theme(
                json!({ "components": { "button": [], "card": null } })
            )),
            ["components.button", "components.card"]
        );
        assert_eq!(
            paths(theme(
                json!({ "components": { "button": { "root": "#003BB2" } } })
            )),
            ["components.button.root"]
        );
    }

    #[test]
    fn the_number_of_components_and_of_slots_is_limited() {
        let components = |count: u32| -> Value {
            (0..count)
                .map(|n| (format!("type-{n}"), json!({})))
                .collect::<Map<String, Value>>()
                .into()
        };
        let at_limit = theme(json!({ "components": components(THEME_MAX_COMPONENTS) }));
        assert_eq!(problems(at_limit), []);
        let over = theme(json!({ "components": components(THEME_MAX_COMPONENTS + 1) }));
        assert_eq!(
            problems(over),
            [(
                "components".to_owned(),
                "The theme styles 201 component types; the limit is 200.".to_owned()
            )]
        );

        let slots = |count: u32| -> Value {
            (0..count)
                .map(|n| (format!("slot{n}"), json!({})))
                .collect::<Map<String, Value>>()
                .into()
        };
        let at_limit = theme(json!({ "components": { "button": slots(THEME_MAX_SLOTS) } }));
        assert_eq!(problems(at_limit), []);
        let over = theme(json!({ "components": { "button": slots(THEME_MAX_SLOTS + 1) } }));
        assert_eq!(paths(over), ["components.button"]);
    }

    #[test]
    fn slot_styles_are_checked_as_they_are_in_a_form() {
        let with_style =
            |style: Value| theme(json!({ "components": { "button": { "root": style } } }));
        assert_eq!(
            paths(with_style(json!({ "margin": "md" }))),
            ["components.button.root.margin"]
        );
        assert_eq!(
            paths(with_style(json!({ "radius": "huge" }))),
            ["components.button.root.radius"]
        );
        assert_eq!(
            paths(with_style(json!({ "padding": 12 }))),
            ["components.button.root.padding"]
        );
        assert_eq!(
            paths(with_style(
                json!({ "color": "red", "background": "#12345", "borderColor": { "token": "Primary Blue" } })
            )),
            [
                "components.button.root.color",
                "components.button.root.background",
                "components.button.root.borderColor",
            ]
        );

        // Word for word what a form is told.
        let in_theme = problems(with_style(json!({ "background": "red" })));
        let in_form = crate::forms::validate::validate(&json!({
            "formatVersion": 1, "name": "x",
            "components": [{
                "id": "c_1", "type": "button", "name": "go",
                "styles": { "root": { "background": "red" } }
            }]
        }))
        .unwrap_err();
        assert_eq!(in_theme[0].0, "components.button.root.background");
        assert_eq!(in_form[0].path, "components[0].styles.root.background");
        assert_eq!(in_theme[0].1, in_form[0].message);
    }

    #[test]
    fn every_problem_is_reported_at_once() {
        let document = theme(json!({
            "colors": { "primary": { "light": "blue", "dark": "#12" }, "accent": {} },
            "radius": 40,
            "textSize": 9,
            "density": "tight",
            "components": {
                "button": { "root": { "background": "red" }, "label": { "color": "#GGGGGG" } },
                "bad type": { "root": { "padding": "huge" } },
            },
            "extra": true,
        }));
        assert_eq!(
            paths(document),
            [
                "colors.primary.light",
                "colors.primary.dark",
                "colors.accent",
                "radius",
                "textSize",
                "density",
                "components.button.root.background",
                "components.button.label.color",
                "components.bad type",
                "components.bad type.root.padding",
                "extra",
            ]
        );
    }

    #[test]
    fn whatever_is_valid_is_a_theme_document() {
        let document = theme(json!({
            "colors": { "primary": { "light": "#0F766E" }, "sidebar": {} },
            "radius": 0,
            "textSize": 16,
            "density": "comfortable",
            "components": { "not-registered": { "root": { "radius": "2xl" } } },
        }));
        assert_eq!(problems(document.clone()), []);
        let typed: ThemeDocument = serde_json::from_value(document.clone()).unwrap();
        assert_eq!(serde_json::to_value(&typed).unwrap(), document);
    }
}
