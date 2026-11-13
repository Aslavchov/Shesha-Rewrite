//! Resolves the build's commit id and guards release builds against shipping
//! without the frontend.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::{env, process};

fn main() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("set by Cargo"));

    // Declaring any `rerun-if-changed` turns off Cargo's default of watching
    // the whole package, so everything this script (or a macro that reads
    // files, like `sqlx::migrate!`) depends on is listed.
    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=migrations");

    emit_commit(&manifest_dir);
    check_frontend(&manifest_dir);
}

/// `BUILD_COMMIT` from the environment, else the short git SHA, else "dev".
fn emit_commit(manifest_dir: &Path) {
    println!("cargo::rerun-if-env-changed=BUILD_COMMIT");

    let commit = env::var("BUILD_COMMIT")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .or_else(|| git(manifest_dir, &["rev-parse", "--short", "HEAD"]))
        .unwrap_or_else(|| "dev".to_owned());
    println!("cargo::rustc-env=SERVER_BUILD_COMMIT={commit}");

    // Re-run when HEAD moves: a checkout changes HEAD itself, a commit
    // changes the branch ref it points to (loose file or packed-refs).
    let mut watched = vec!["HEAD".to_owned(), "packed-refs".to_owned()];
    watched.extend(git(manifest_dir, &["symbolic-ref", "--quiet", "HEAD"]));
    for name in watched {
        let Some(path) = git(manifest_dir, &["rev-parse", "--git-path", &name]) else {
            continue;
        };
        // A path that does not exist would make Cargo re-run this script on
        // every build.
        if manifest_dir.join(&path).exists() {
            println!("cargo::rerun-if-changed={path}");
        }
    }
}

/// Runs git in the crate directory; `None` if git is missing, fails or
/// prints nothing.
fn git(manifest_dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(manifest_dir)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (!text.is_empty()).then_some(text)
}

/// rust-embed compiles `web/dist` into the binary exactly when debug
/// assertions are off (release builds); otherwise it reads the folder at run
/// time. So an embedding build without a built frontend is an error, and any
/// other build must not care whether the folder exists.
fn check_frontend(manifest_dir: &Path) {
    let embeds_frontend = env::var_os("CARGO_CFG_DEBUG_ASSERTIONS").is_none();
    if !embeds_frontend {
        return;
    }

    let dist = manifest_dir.join("../../web/dist");
    if !dist.join("index.html").is_file() {
        println!(
            "cargo::error=web/dist/index.html is missing. Release builds embed the frontend, \
             so build it first (`npm run build` in web/) and then build the binary again."
        );
        process::exit(1);
    }
    // The embed macro cannot tell Cargo about files that appear in or vanish
    // from the folder (Vite renames its hashed files on every build).
    println!("cargo::rerun-if-changed={}", dist.display());
}
