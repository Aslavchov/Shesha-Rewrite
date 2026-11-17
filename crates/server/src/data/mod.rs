//! `/api/data/{entity}`: the rows of every entity (ADR 0011). An entity has
//! these routes from the moment it is defined; nothing is generated or
//! registered per entity.

pub mod query;
pub mod rows;
pub mod values;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use contracts::{DataPage, DataRow, DataValues};
use serde_json::{Map, Value};

use crate::api::{based_on_revision, reading, request_object, writing};
use crate::entities::catalog::Catalog;
use crate::error::AppError;
use crate::router::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/data/{entity}", post(create))
        .route("/data/{entity}/query", post(list))
        .route(
            "/data/{entity}/{id}",
            get(read).patch(update).delete(remove),
        )
}

async fn list(
    State(state): State<AppState>,
    Path(entity): Path<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<DataPage>, AppError> {
    let query = request_object(body)?;
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let entity = catalog.entity(&entity)?;
    let page = query::run(&mut tx, &catalog, entity, Value::Object(query)).await?;
    Ok(Json(page))
}

/// The `values` of a write: property name to value.
fn values_of(body: &mut Map<String, Value>) -> Result<DataValues, AppError> {
    match body.remove("values") {
        Some(Value::Object(values)) => Ok(values),
        _ => Err(AppError::invalid_request(
            "The request needs \"values\": an object of property names and their values.",
        )),
    }
}

async fn create(
    State(state): State<AppState>,
    Path(entity): Path<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<(StatusCode, Json<DataRow>), AppError> {
    let mut body = request_object(body)?;
    let values = values_of(&mut body)?;

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let entity = catalog.entity(&entity)?;
    let row = rows::create(&mut tx, &catalog, entity, &values, None).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn read(
    State(state): State<AppState>,
    Path((entity, id)): Path<(String, String)>,
) -> Result<Json<DataRow>, AppError> {
    let mut tx = reading(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let entity = catalog.entity(&entity)?;
    match rows::get(&mut tx, &catalog, entity, &id).await? {
        Some(row) => Ok(Json(row)),
        None => Err(rows::row_not_found(entity, &id)),
    }
}

async fn update(
    State(state): State<AppState>,
    Path((entity, id)): Path<(String, String)>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<DataRow>, AppError> {
    let mut body = request_object(body)?;
    let based_on = based_on_revision(&body)?;
    let values = values_of(&mut body)?;

    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let entity = catalog.entity(&entity)?;
    let row = rows::update(&mut tx, &catalog, entity, &id, based_on, &values).await?;
    tx.commit().await?;
    Ok(Json(row))
}

async fn remove(
    State(state): State<AppState>,
    Path((entity, id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let mut tx = writing(&state.pool).await?;
    let catalog = Catalog::load(&mut tx).await?;
    let entity = catalog.entity(&entity)?;
    rows::delete(&mut tx, &catalog, entity, &id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
