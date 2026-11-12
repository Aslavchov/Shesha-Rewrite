//! Resolved settings: the command line plus the defaults derived from the
//! binary's name and location.

use std::path::{Path, PathBuf};
use std::{env, io};

use crate::cli::Cli;

pub const DEFAULT_PORT: u16 = 7400;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub port: u16,
    pub data_dir: PathBuf,
    pub demo: bool,
}

impl Settings {
    /// Fails only when `--data-dir` was not given and the executable's own
    /// location cannot be determined.
    pub fn resolve(cli: Cli, bin_name: &str) -> io::Result<Self> {
        let data_dir = match cli.data_dir {
            Some(dir) => dir,
            None => default_data_dir(bin_name)?,
        };
        Ok(Self {
            port: cli.port,
            data_dir,
            demo: cli.demo,
        })
    }
}

pub fn data_dir_name(bin_name: &str) -> String {
    format!("{bin_name}-data")
}

/// Where the database file lives inside the data directory.
pub fn db_path(data_dir: &Path, bin_name: &str) -> PathBuf {
    data_dir.join(format!("{bin_name}.db"))
}

/// A folder next to the executable, so a downloaded binary keeps its data
/// beside itself wherever it is started from.
fn default_data_dir(bin_name: &str) -> io::Result<PathBuf> {
    let exe = env::current_exe()?;
    let dir = exe
        .parent()
        .ok_or_else(|| io::Error::other(format!("{} has no parent directory", exe.display())))?;
    Ok(dir.join(data_dir_name(bin_name)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli(data_dir: Option<&str>) -> Cli {
        Cli {
            port: 7400,
            data_dir: data_dir.map(PathBuf::from),
            demo: false,
        }
    }

    #[test]
    fn explicit_data_dir_is_used_as_given() {
        let settings = Settings::resolve(cli(Some("elsewhere")), "app").unwrap();
        assert_eq!(settings.data_dir, PathBuf::from("elsewhere"));
    }

    #[test]
    fn default_data_dir_sits_next_to_the_executable() {
        let settings = Settings::resolve(cli(None), "app").unwrap();
        let exe_dir = env::current_exe().unwrap().parent().unwrap().to_owned();
        assert_eq!(settings.data_dir, exe_dir.join("app-data"));
    }

    #[test]
    fn database_file_is_named_after_the_binary() {
        assert_eq!(
            db_path(Path::new("data"), "app"),
            Path::new("data").join("app.db")
        );
    }
}
