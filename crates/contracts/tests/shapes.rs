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
