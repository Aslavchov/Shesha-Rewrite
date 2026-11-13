//! The JSON shapes are a frozen contract (spec 5.1 and 7), so they are
//! pinned here literally.

use contracts::{ApiError, AppInfo, DbStatus, HealthResponse, HealthStatus};
use serde_json::json;

#[test]
fn health_response_ok_shape() {
    let health = HealthResponse::new("1.2.3", DbStatus::Ok);
    let value = serde_json::to_value(&health).unwrap();

    assert_eq!(
        value,
        json!({ "status": "ok", "version": "1.2.3", "db": "ok" })
    );
    assert_eq!(
        serde_json::from_value::<HealthResponse>(value).unwrap(),
        health
    );
}

#[test]
fn health_status_is_error_whenever_db_is_error() {
    let health = HealthResponse::new("1.2.3", DbStatus::Error);
    assert_eq!(health.status, HealthStatus::Error);

    let value = serde_json::to_value(&health).unwrap();
    assert_eq!(
        value,
        json!({ "status": "error", "version": "1.2.3", "db": "error" })
    );
    assert_eq!(
        serde_json::from_value::<HealthResponse>(value).unwrap(),
        health
    );
}

#[test]
fn health_rejects_values_outside_the_closed_set() {
    let value = json!({ "status": "degraded", "version": "1.2.3", "db": "ok" });
    assert!(serde_json::from_value::<HealthResponse>(value).is_err());
}

#[test]
fn app_info_shape() {
    let info = AppInfo {
        name: contracts::APP_NAME.to_owned(),
        version: "1.2.3".to_owned(),
        commit: "abc1234".to_owned(),
    };
    let value = serde_json::to_value(&info).unwrap();

    assert_eq!(
        value,
        json!({ "name": contracts::APP_NAME, "version": "1.2.3", "commit": "abc1234" })
    );
    assert_eq!(serde_json::from_value::<AppInfo>(value).unwrap(), info);
}

#[test]
fn api_error_shape() {
    let error = ApiError::new("not_found", "Nothing here.");
    let value = serde_json::to_value(&error).unwrap();

    assert_eq!(
        value,
        json!({ "error": { "code": "not_found", "message": "Nothing here." } })
    );
    assert_eq!(serde_json::from_value::<ApiError>(value).unwrap(), error);
}

// --- Phase 1: error details (ADR 0007) -----------------------------------

#[test]
fn api_error_details_are_listed_when_present_and_left_out_when_empty() {
    use contracts::ErrorDetail;

    let error = ApiError::new("invalid_form", "The form document has 1 problem.")
        .with_details(vec![ErrorDetail::new("components[0].name", "Not a name.")]);
    let value = serde_json::to_value(&error).unwrap();
    assert_eq!(
        value,
        json!({ "error": {
            "code": "invalid_form",
            "message": "The form document has 1 problem.",
            "details": [{ "path": "components[0].name", "message": "Not a name." }],
        } })
    );
    assert_eq!(serde_json::from_value::<ApiError>(value).unwrap(), error);

    let empty = ApiError::new("not_found", "Nothing here.").with_details(Vec::new());
    assert_eq!(
        serde_json::to_value(&empty).unwrap(),
        json!({ "error": { "code": "not_found", "message": "Nothing here." } })
    );
}

// --- Phase 1: the form document (ADR 0003, frozen) -------------------------

#[test]
fn form_document_shape() {
    use contracts::{ColorValue, FontWeight, FormDocument, Radius, Space};

    let value = json!({
        "formatVersion": 1,
        "name": "Person details",
        "description": "A demo.",
        "settings": { "gap": "lg" },
        "components": [{
            "id": "c_1",
            "type": "columns",
            "name": "row",
            "regions": {
                "col1": [{
                    "id": "c_2",
                    "type": "text-field",
                    "name": "email",
                    "bind": "contact.email",
                    "settings": { "label": "Email", "required": true },
                    "styles": {
                        "control": { "background": { "token": "muted" }, "radius": "2xl", "padding": "sm" },
                        "label": { "color": "#003BB2", "borderColor": "#003BB280", "fontWeight": "semibold" },
                    },
                }],
            },
        }],
    });

    let document: FormDocument = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(document.format_version, contracts::FORM_FORMAT_VERSION);
    let email = &document.components[0].regions["col1"][0];
    assert_eq!(email.component_type, "text-field");
    assert_eq!(email.bind.as_deref(), Some("contact.email"));
    assert_eq!(email.settings["required"], json!(true));
    let label = &email.styles["label"];
    assert_eq!(label.color, Some(ColorValue::Literal("#003BB2".to_owned())));
    assert_eq!(label.font_weight, Some(FontWeight::Semibold));
    let control = &email.styles["control"];
    assert!(matches!(&control.background, Some(ColorValue::Token(t)) if t.token == "muted"));
    assert_eq!(control.radius, Some(Radius::TwoXl));
    assert_eq!(control.padding, Some(Space::Sm));

    assert_eq!(serde_json::to_value(&document).unwrap(), value);
}

#[test]
fn empty_optional_parts_of_a_document_are_left_out() {
    use contracts::FormDocument;

    let value = json!({
        "formatVersion": 1,
        "name": "Bare",
        "components": [{ "id": "c_1", "type": "button", "name": "go" }],
    });
    let document: FormDocument = serde_json::from_value(value.clone()).unwrap();

    assert_eq!(document.description, "");
    assert!(document.settings.is_empty());
    assert_eq!(document.components[0].bind, None);
    assert_eq!(serde_json::to_value(&document).unwrap(), value);
}

#[test]
fn style_scales_are_closed_sets() {
    use contracts::{FontWeight, Radius, Space};

    let radius = ["none", "sm", "md", "lg", "xl", "2xl", "full"];
    let weight = ["normal", "medium", "semibold"];
    let space = ["none", "xs", "sm", "md", "lg", "xl"];
    for name in radius {
        assert_eq!(
            serde_json::to_value(serde_json::from_value::<Radius>(json!(name)).unwrap()).unwrap(),
            json!(name)
        );
    }
    for name in weight {
        assert!(serde_json::from_value::<FontWeight>(json!(name)).is_ok());
    }
    for name in space {
        assert!(serde_json::from_value::<Space>(json!(name)).is_ok());
    }
    assert!(serde_json::from_value::<Radius>(json!("3xl")).is_err());
    assert!(serde_json::from_value::<FontWeight>(json!("bold")).is_err());
    assert!(serde_json::from_value::<Space>(json!("2xl")).is_err());
}

// --- Phase 1: the forms API (ADR 0007, frozen) -----------------------------

#[test]
fn forms_api_shapes() {
    use contracts::{CreateFormRequest, FormList, FormRecord, UpdateFormRequest};

    let document = json!({ "formatVersion": 1, "name": "Bare", "components": [] });

    let list = json!({ "forms": [{
        "id": "abc", "name": "Bare", "description": "", "updatedAt": "2026-11-13T09:15:02.417Z", "revision": 3,
    }] });
    let parsed: FormList = serde_json::from_value(list.clone()).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), list);

    let record = json!({
        "id": "abc", "revision": 3, "updatedAt": "2026-11-13T09:15:02.417Z", "document": document,
    });
    let parsed: FormRecord = serde_json::from_value(record.clone()).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), record);

    let create = json!({ "document": document });
    let parsed: CreateFormRequest = serde_json::from_value(create.clone()).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), create);

    let update = json!({ "revision": 3, "document": document });
    let parsed: UpdateFormRequest = serde_json::from_value(update.clone()).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), update);
}
