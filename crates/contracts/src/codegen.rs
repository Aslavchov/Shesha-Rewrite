//! Renders the TypeScript in `web/src/generated`.
//!
//! Rendering (pure, in memory) is separate from writing, so the
//! `generate-types` binary and the "is it up to date?" test share one source
//! of truth and the test never touches the disk.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::{fs, io};

use ts_rs::{Config, TS};

use crate::forms::SettingsTs;
use crate::{
    ApiError, ApiErrorBody, AppInfo, ColorToken, ColorValue, ComponentInstance, CreateFormRequest,
    DbStatus, ErrorDetail, FontWeight, FormDocument, FormList, FormRecord, FormSummary,
    HealthResponse, HealthStatus, Radius, SlotStyle, Space, UpdateFormRequest,
};

/// The one command that regenerates the files. Named in every file header.
pub const COMMAND: &str = "cargo run -p contracts --bin generate-types";

const EXTENSION: &str = "ts";

/// File name → file contents. A `BTreeMap` keeps the order stable.
pub type Files = BTreeMap<String, String>;

/// `web/src/generated`, located from this crate so the working directory
/// does not matter.
pub fn output_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../web/src/generated")
}

/// Everything the generator would write.
pub fn render() -> Files {
    // `Config::new()` rather than `Config::from_env()`: the output must not
    // depend on TS_RS_* variables in the caller's environment.
    let cfg = Config::new();

    let mut types = Files::new();
    add_type::<ApiError>(&cfg, &mut types);
    add_type::<ApiErrorBody>(&cfg, &mut types);
    add_type::<AppInfo>(&cfg, &mut types);
    add_type::<ColorToken>(&cfg, &mut types);
    add_type::<ColorValue>(&cfg, &mut types);
    add_type::<ComponentInstance>(&cfg, &mut types);
    add_type::<CreateFormRequest>(&cfg, &mut types);
    add_type::<DbStatus>(&cfg, &mut types);
    add_type::<ErrorDetail>(&cfg, &mut types);
    add_type::<FontWeight>(&cfg, &mut types);
    add_type::<FormDocument>(&cfg, &mut types);
    add_type::<FormList>(&cfg, &mut types);
    add_type::<FormRecord>(&cfg, &mut types);
    add_type::<FormSummary>(&cfg, &mut types);
    add_type::<HealthResponse>(&cfg, &mut types);
    add_type::<HealthStatus>(&cfg, &mut types);
    add_type::<Radius>(&cfg, &mut types);
    add_type::<SettingsTs>(&cfg, &mut types);
    add_type::<SlotStyle>(&cfg, &mut types);
    add_type::<Space>(&cfg, &mut types);
    add_type::<UpdateFormRequest>(&cfg, &mut types);

    let mut barrel = header();
    barrel.push_str("export { APP_NAME } from \"./app\";\n");
    barrel.push_str("export { FORM_FORMAT_VERSION } from \"./form\";\n");
    for name in types.keys() {
        barrel.push_str(&format!("export type {{ {name} }} from \"./{name}\";\n"));
    }

    let mut files = Files::new();
    for (name, contents) in types {
        files.insert(format!("{name}.{EXTENSION}"), contents);
    }
    // `{:?}` on a `&str` yields a quoted, escaped literal that is also valid
    // TypeScript.
    files.insert(
        format!("app.{EXTENSION}"),
        format!(
            "{}export const APP_NAME = {:?};\n",
            header(),
            crate::APP_NAME
        ),
    );
    files.insert(
        format!("form.{EXTENSION}"),
        format!(
            "{}export const FORM_FORMAT_VERSION = {};\n",
            header(),
            crate::FORM_FORMAT_VERSION
        ),
    );
    files.insert(format!("index.{EXTENSION}"), barrel);
    files
}

/// Replaces the generated files in `dir` with `files`.
pub fn write(dir: &Path, files: &Files) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    for name in existing(dir)? {
        fs::remove_file(dir.join(name))?;
    }
    for (name, contents) in files {
        fs::write(dir.join(name), contents)?;
    }
    Ok(())
}

/// Describes how `dir` differs from `files`; empty when it is up to date.
pub fn stale(dir: &Path, files: &Files) -> io::Result<Vec<String>> {
    let mut problems = Vec::new();
    for (name, expected) in files {
        match fs::read_to_string(dir.join(name)) {
            Ok(actual) if actual == *expected => {}
            Ok(_) => problems.push(format!("{name}: out of date")),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                problems.push(format!("{name}: missing"));
            }
            Err(e) => return Err(e),
        }
    }
    for name in existing(dir)? {
        if !files.contains_key(&name) {
            problems.push(format!("{name}: no longer generated"));
        }
    }
    Ok(problems)
}

/// The generated (`.ts`) files currently in `dir`, sorted. A missing
/// directory counts as empty.
fn existing(dir: &Path) -> io::Result<Vec<String>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut names = Vec::new();
    for entry in entries {
        let path = entry?.path();
        if path.is_file()
            && path.extension().is_some_and(|ext| ext == EXTENSION)
            && let Some(name) = path.file_name().and_then(|name| name.to_str())
        {
            names.push(name.to_owned());
        }
    }
    names.sort();
    Ok(names)
}

fn header() -> String {
    format!("// Generated by `{COMMAND}`. Do not edit by hand.\n\n")
}

fn add_type<T: TS + 'static>(cfg: &Config, types: &mut Files) {
    let rendered = T::export_to_string(cfg)
        .unwrap_or_else(|e| panic!("ts-rs cannot render {}: {e}", T::name(cfg)));
    // ts-rs starts its output with its own one-line "generated" comment
    // (ours replaces it) and leaves trailing spaces around doc comments.
    let body = match rendered.split_once('\n') {
        Some((first, rest)) if first.starts_with("//") => rest,
        _ => rendered.as_str(),
    };
    let mut contents = header();
    for line in body.trim().lines() {
        contents.push_str(line.trim_end());
        contents.push('\n');
    }
    // Guards the byte-stability promise on every platform.
    assert!(!contents.contains('\r'), "generated TypeScript must use LF");
    types.insert(T::name(cfg), contents);
}
