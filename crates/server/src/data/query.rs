//! The one list query format (ADR 0011): paging, sorting, typed filters,
//! quick search and a choice of properties, all run by SQLite.
//!
//! A query is checked completely before any SQL is written. A property is
//! looked up in the definition and replaced by its generated column name, so
//! a name that is not a property never reaches the database: it is a 400
//! with the place it was found. Everything else a query carries is a bound
//! parameter.

use contracts::{
    DATA_DEFAULT_PAGE_SIZE, DATA_MAX_FILTERS, DATA_MAX_PAGE_SIZE, DATA_MAX_SEARCH_CHARS,
    DATA_MAX_SORTS, DataFilter, DataPage, DataQuery, ErrorDetail, FilterOp, PropertyDefinition,
    PropertyType, SortDirection,
};
use serde_json::Value;
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

use super::rows::{Reader, TABLE};
use super::values::Cell;
use crate::api::parse_problem;
use crate::entities::catalog::{Catalog, StoredEntity};
use crate::entities::validate::is_iso_date;
use crate::error::AppError;

/// A piece of a statement: SQL made of generated names and keywords, or a
/// value to bind.
enum Part {
    Sql(String),
    Value(Cell),
}

/// Pieces that together are one condition or one sort expression.
type Parts = Vec<Part>;

fn sql(text: impl Into<String>) -> Part {
    Part::Sql(text.into())
}

fn text(value: impl Into<String>) -> Part {
    Part::Value(Cell::Text(value.into()))
}

fn push(builder: &mut QueryBuilder<Sqlite>, parts: &Parts) {
    for part in parts {
        match part {
            Part::Sql(text) => {
                builder.push(text);
            }
            Part::Value(cell) => cell.bind(builder),
        }
    }
}

/// A `LIKE` pattern for text containing `needle`, or starting with it. `%`,
/// `_` and the escape character itself are taken literally.
fn like(needle: &str, anywhere: bool) -> String {
    let mut pattern = String::with_capacity(needle.len() + 2);
    if anywhere {
        pattern.push('%');
    }
    for character in needle.chars() {
        if matches!(character, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    pattern.push('%');
    pattern
}

const LIKE_ESCAPE: &str = " ESCAPE '\\'";

/// A checked query, ready to run.
struct Plan<'a> {
    reader: Reader<'a>,
    /// Every one must hold.
    conditions: Vec<Parts>,
    order: Vec<(Parts, SortDirection)>,
    page: u32,
    page_size: u32,
}

struct Planner<'a> {
    catalog: &'a Catalog,
    entity: &'a StoredEntity,
    /// Reads every property: what the conditions and the order are written with.
    reader: Reader<'a>,
    problems: Vec<ErrorDetail>,
}

impl<'a> Planner<'a> {
    fn problem(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.problems.push(ErrorDetail::new(path, message));
    }

    /// The property a query names, or a problem at `path`.
    fn property(&mut self, path: &str, name: &str) -> Option<&'a PropertyDefinition> {
        let found = self.entity.property(name);
        if found.is_none() {
            self.problem(
                path,
                format!(
                    "{} has no property named {name:?}.",
                    self.entity.definition.display_name
                ),
            );
        }
        found
    }

    fn select(&mut self, select: Option<&Vec<String>>) -> Vec<&'a PropertyDefinition> {
        match select {
            None => self.entity.definition.properties.iter().collect(),
            Some(names) => names
                .iter()
                .enumerate()
                .filter_map(|(index, name)| self.property(&format!("select[{index}]"), name))
                .collect(),
        }
    }

    fn filter(&mut self, index: usize, filter: &DataFilter) -> Option<Parts> {
        use FilterOp::{Contains, Empty, Eq, Gt, Gte, In, Lt, Lte, NotEmpty, StartsWith};
        use PropertyType::{Boolean, Date, Number, Reference, ReferenceList, Text};

        let path = format!("filter[{index}]");
        let property = self.property(&format!("{path}.property"), &filter.property)?;
        let column = self.reader.column(property);
        let kind = property.property_type;
        let label = &property.display_name;

        let allowed: &[FilterOp] = match kind {
            Text => &[Eq, Contains, StartsWith, Empty, NotEmpty],
            Number | Date => &[Eq, Gt, Gte, Lt, Lte, Empty, NotEmpty],
            Boolean => &[Eq],
            ReferenceList | Reference => &[Eq, In, Empty, NotEmpty],
        };
        if !allowed.contains(&filter.op) {
            let names: Vec<&str> = allowed.iter().map(|op| op.name()).collect();
            self.problem(
                format!("{path}.op"),
                format!(
                    "{:?} does not apply to {label}, a {} property. Use one of: {}.",
                    filter.op.name(),
                    kind.word(),
                    names.join(", ")
                ),
            );
            return None;
        }

        match filter.op {
            Empty => return Some(vec![sql(format!("{column} IS NULL"))]),
            NotEmpty => return Some(vec![sql(format!("{column} IS NOT NULL"))]),
            _ => {}
        }
        let value_path = format!("{path}.value");
        let Some(value) = &filter.value else {
            self.problem(
                value_path,
                format!("{:?} needs a value to compare with.", filter.op.name()),
            );
            return None;
        };

        let comparison = match filter.op {
            Gt => ">",
            Gte => ">=",
            Lt => "<",
            Lte => "<=",
            _ => "=",
        };
        match kind {
            Text => {
                let Some(needle) = value.as_str() else {
                    self.problem(value_path, format!("{label} is compared with text."));
                    return None;
                };
                Some(match filter.op {
                    // As for search: LIKE would stop at a NUL character.
                    Contains | StartsWith if needle.contains('\0') => vec![sql("0")],
                    Contains | StartsWith => vec![
                        sql(format!("{column} LIKE ")),
                        text(like(needle, filter.op == Contains)),
                        sql(LIKE_ESCAPE),
                    ],
                    _ => vec![
                        sql(format!("{column} = ")),
                        text(needle),
                        sql(" COLLATE NOCASE"),
                    ],
                })
            }
            Number => {
                let number = value
                    .as_f64()
                    .filter(|n| value.is_number() && n.is_finite());
                let Some(number) = number else {
                    self.problem(value_path, format!("{label} is compared with a number."));
                    return None;
                };
                Some(vec![
                    sql(format!("{column} {comparison} ")),
                    Part::Value(Cell::Real(number)),
                ])
            }
            Date => {
                let Some(date) = value.as_str().filter(|date| is_iso_date(date)) else {
                    self.problem(
                        value_path,
                        format!("{label} is compared with a date, written as YYYY-MM-DD."),
                    );
                    return None;
                };
                Some(vec![sql(format!("{column} {comparison} ")), text(date)])
            }
            Boolean => {
                let Some(flag) = value.as_bool() else {
                    self.problem(
                        value_path,
                        format!("{label} is compared with true or false."),
                    );
                    return None;
                };
                Some(vec![
                    sql(format!("COALESCE({column}, 0) = ")),
                    Part::Value(Cell::Int(i64::from(flag))),
                ])
            }
            ReferenceList | Reference => {
                let chosen: Option<Vec<&str>> = match (filter.op, value) {
                    (In, Value::Array(items)) => items.iter().map(Value::as_str).collect(),
                    (Eq, Value::String(one)) => Some(vec![one.as_str()]),
                    _ => None,
                };
                let Some(chosen) = chosen else {
                    self.problem(
                        value_path,
                        if filter.op == In {
                            format!("\"in\" compares {label} with a list of values.")
                        } else {
                            format!("{label} is compared with one value, as text.")
                        },
                    );
                    return None;
                };
                if kind == ReferenceList
                    && let Some(list) = self.catalog.list_of(property)
                    && let Some(unknown) = chosen.iter().find(|value| list.item(value).is_none())
                {
                    self.problem(
                        value_path,
                        format!("{} has no item {unknown:?}.", list.definition.display_name),
                    );
                    return None;
                }
                if chosen.is_empty() {
                    return Some(vec![sql("0")]);
                }
                let mut parts = vec![sql(format!("{column} IN ("))];
                for (position, value) in chosen.iter().enumerate() {
                    if position > 0 {
                        parts.push(sql(", "));
                    }
                    parts.push(text(*value));
                }
                parts.push(sql(")"));
                Some(parts)
            }
        }
    }

    /// Quick search (spec section 4): the text is looked for in every text
    /// property, in the labels of reference list values, and in the display
    /// value of referenced rows. It is only ever a bound parameter.
    fn search(&mut self, search: Option<&String>) -> Option<Parts> {
        let needle = search?.trim();
        if needle.is_empty() {
            return None;
        }
        let chars = needle.chars().count();
        if chars > DATA_MAX_SEARCH_CHARS as usize {
            self.problem(
                "search",
                format!(
                    "The search text is {chars} characters long; the limit is {DATA_MAX_SEARCH_CHARS}."
                ),
            );
            return None;
        }
        // Search text is plain text: it is only ever a bound parameter, so
        // ";" or "--" in it is something to look for, nothing more. Control
        // characters are refused: they are never typed, and SQLite's LIKE
        // stops reading a pattern at a NUL, which would match every row.
        if needle.chars().any(char::is_control) {
            self.problem(
                "search",
                "Search for words, names or labels. The search text cannot contain control characters.",
            );
            return None;
        }
        let pattern = like(needle, true);
        let lowered = needle.to_lowercase();

        let mut parts: Parts = vec![sql("(0")];
        for property in &self.entity.definition.properties {
            let column = self.reader.column(property);
            match property.property_type {
                PropertyType::Text => {
                    parts.push(sql(format!(" OR {column} LIKE ")));
                    parts.push(text(pattern.clone()));
                    parts.push(sql(LIKE_ESCAPE));
                }
                PropertyType::ReferenceList => {
                    let Some(list) = self.catalog.list_of(property) else {
                        continue;
                    };
                    let matching: Vec<&str> = list
                        .definition
                        .items
                        .iter()
                        .filter(|item| item.label.to_lowercase().contains(&lowered))
                        .map(|item| item.value.as_str())
                        .collect();
                    if matching.is_empty() {
                        continue;
                    }
                    parts.push(sql(format!(" OR {column} IN (")));
                    for (position, value) in matching.iter().enumerate() {
                        if position > 0 {
                            parts.push(sql(", "));
                        }
                        parts.push(text(*value));
                    }
                    parts.push(sql(")"));
                }
                PropertyType::Reference => {
                    // Only a display property is text worth searching; a
                    // target without one is shown by its id.
                    let Some(target) = self.catalog.target_of(property) else {
                        continue;
                    };
                    let Some(display) = target.display_property() else {
                        continue;
                    };
                    let alias = self.reader.join_alias(property);
                    parts.push(sql(format!(
                        " OR {alias}.{} LIKE ",
                        target.column_of(display)
                    )));
                    parts.push(text(pattern.clone()));
                    parts.push(sql(LIKE_ESCAPE));
                }
                PropertyType::Number | PropertyType::Boolean | PropertyType::Date => {}
            }
        }
        parts.push(sql(")"));
        Some(parts)
    }

    fn sort(&mut self, index: usize, name: &str) -> Option<Parts> {
        match name {
            "id" => return Some(vec![sql(format!("{TABLE}.id"))]),
            "createdAt" => return Some(vec![sql(format!("{TABLE}.created_at"))]),
            "updatedAt" => return Some(vec![sql(format!("{TABLE}.updated_at"))]),
            _ => {}
        }
        let property = self.property(&format!("sort[{index}].property"), name)?;
        let column = self.reader.column(property);
        Some(match property.property_type {
            PropertyType::Text => vec![sql(format!("{column} COLLATE NOCASE"))],
            // By the list's own order, which is the order people chose.
            PropertyType::ReferenceList => {
                let mut parts = vec![sql(format!("CASE {column}"))];
                let items = self
                    .catalog
                    .list_of(property)
                    .map(|list| list.definition.items.as_slice())
                    .unwrap_or_default();
                for (position, item) in items.iter().enumerate() {
                    parts.push(sql(" WHEN "));
                    parts.push(text(item.value.as_str()));
                    parts.push(sql(format!(" THEN {position}")));
                }
                parts.push(sql(format!(" ELSE {} END", items.len())));
                // `CASE x END` with no WHEN is not SQL.
                if items.is_empty() {
                    parts = vec![sql(column)];
                }
                parts
            }
            // By what is shown: the referenced row's display value.
            PropertyType::Reference => match self.reader.reference_display(property) {
                Some(display) => vec![sql(format!("{display} COLLATE NOCASE"))],
                None => vec![sql(column)],
            },
            PropertyType::Number | PropertyType::Boolean | PropertyType::Date => {
                vec![sql(column)]
            }
        })
    }
}

fn plan<'a>(
    catalog: &'a Catalog,
    entity: &'a StoredEntity,
    query: &DataQuery,
) -> Result<Plan<'a>, Vec<ErrorDetail>> {
    let mut planner = Planner {
        catalog,
        entity,
        reader: Reader::all(catalog, entity),
        problems: Vec::new(),
    };

    let selected = planner.select(query.select.as_ref());

    let filters = query.filter.as_deref().unwrap_or_default();
    if filters.len() > DATA_MAX_FILTERS as usize {
        planner.problem(
            "filter",
            format!("A query has at most {DATA_MAX_FILTERS} filters."),
        );
    }
    let mut conditions: Vec<Parts> = filters
        .iter()
        .enumerate()
        .filter_map(|(index, filter)| planner.filter(index, filter))
        .collect();
    conditions.extend(planner.search(query.search.as_ref()));

    let sorts = query.sort.as_deref().unwrap_or_default();
    if sorts.len() > DATA_MAX_SORTS as usize {
        planner.problem(
            "sort",
            format!("A query sorts by at most {DATA_MAX_SORTS} properties."),
        );
    }
    let mut order: Vec<(Parts, SortDirection)> = sorts
        .iter()
        .enumerate()
        .filter_map(|(index, sort)| {
            planner
                .sort(index, &sort.property)
                .map(|parts| (parts, sort.direction))
        })
        .collect();
    // Without an order of its own, the order rows were created in. The id
    // always breaks ties, so paging never shows a row twice or skips one.
    if order.is_empty() {
        order.push((vec![sql(format!("{TABLE}.created_at"))], SortDirection::Asc));
    }
    order.push((vec![sql(format!("{TABLE}.id"))], SortDirection::Asc));

    let page = query.page.unwrap_or(1);
    if page == 0 {
        planner.problem("page", "Pages are numbered from 1.");
    }
    let page_size = query.page_size.unwrap_or(DATA_DEFAULT_PAGE_SIZE);
    if !(1..=DATA_MAX_PAGE_SIZE).contains(&page_size) {
        planner.problem(
            "pageSize",
            format!("The page size is from 1 to {DATA_MAX_PAGE_SIZE}."),
        );
    }

    if !planner.problems.is_empty() {
        return Err(planner.problems);
    }
    Ok(Plan {
        reader: Reader::only(catalog, entity, &selected),
        conditions,
        order,
        page,
        page_size,
    })
}

fn push_where(builder: &mut QueryBuilder<Sqlite>, conditions: &[Parts]) {
    for (index, condition) in conditions.iter().enumerate() {
        builder.push(if index == 0 { " WHERE (" } else { " AND (" });
        push(builder, condition);
        builder.push(")");
    }
}

/// Runs a list query, given as the JSON a request sent.
pub async fn run(
    connection: &mut SqliteConnection,
    catalog: &Catalog,
    entity: &StoredEntity,
    query: Value,
) -> Result<DataPage, AppError> {
    let invalid = |details| AppError::invalid("invalid_query", "query", details);
    let query: DataQuery = serde_path_to_error::deserialize(query)
        .map_err(|error| invalid(vec![parse_problem(&error)]))?;
    let plan = plan(catalog, entity, &query).map_err(invalid)?;

    let mut counting = QueryBuilder::<Sqlite>::new("SELECT COUNT(*)");
    plan.reader.push_from(&mut counting);
    push_where(&mut counting, &plan.conditions);
    let total: u32 = counting
        .build_query_scalar()
        .fetch_one(&mut *connection)
        .await?;

    let mut builder = QueryBuilder::<Sqlite>::new("");
    plan.reader.push_select(&mut builder);
    plan.reader.push_from(&mut builder);
    push_where(&mut builder, &plan.conditions);
    for (index, (expression, direction)) in plan.order.iter().enumerate() {
        builder.push(if index == 0 { " ORDER BY " } else { ", " });
        push(&mut builder, expression);
        builder.push(match direction {
            SortDirection::Asc => " ASC",
            SortDirection::Desc => " DESC",
        });
    }
    builder.push(" LIMIT ");
    builder.push_bind(plan.page_size);
    builder.push(" OFFSET ");
    builder.push_bind(i64::from(plan.page - 1) * i64::from(plan.page_size));

    let rows = builder.build().fetch_all(connection).await?;
    let rows = rows
        .iter()
        .map(|row| plan.reader.read(row))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DataPage {
        rows,
        page: plan.page,
        page_size: plan.page_size,
        total,
    })
}

#[cfg(test)]
mod tests {
    use super::like;

    #[test]
    fn like_patterns_take_wildcards_literally() {
        assert_eq!(like("smi", true), "%smi%");
        assert_eq!(like("smi", false), "smi%");
        assert_eq!(like("50%_a\\b", true), "%50\\%\\_a\\\\b%");
    }
}
