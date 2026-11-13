//! Command-line flags.

use std::path::PathBuf;

use clap::{CommandFactory, FromArgMatches, Parser};

use crate::config::{DEFAULT_PORT, data_dir_name};

#[derive(Debug, Parser)]
#[command(version)]
pub struct Cli {
    /// Port to listen on. If it is busy, the next free port is used
    #[arg(long, value_name = "N", default_value_t = DEFAULT_PORT)]
    pub port: u16,

    /// Folder for the database
    #[arg(long, value_name = "PATH")]
    pub data_dir: Option<PathBuf>,

    /// Reset the database to the seed state, then start
    #[arg(long)]
    pub demo: bool,
}

/// Parses the process arguments. On `--help`, `--version` or a usage error
/// clap prints the message and exits.
pub fn parse(bin_name: &'static str) -> Cli {
    // The names are only known at run time (see `main.rs`), so the parts of
    // the help text that mention them are filled in here.
    let command = Cli::command()
        .name(bin_name)
        .about(format!("{} local server", contracts::APP_NAME))
        .mut_arg("data_dir", |arg| {
            arg.help(format!(
                "Folder for the database [default: {} next to the executable]",
                data_dir_name(bin_name)
            ))
        });
    Cli::from_arg_matches(&command.get_matches()).unwrap_or_else(|e| e.exit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults() {
        let cli = Cli::try_parse_from(["bin"]).unwrap();
        assert_eq!(cli.port, 7400);
        assert_eq!(cli.data_dir, None);
        assert!(!cli.demo);
    }

    #[test]
    fn all_flags() {
        let cli =
            Cli::try_parse_from(["bin", "--port", "8123", "--data-dir", "some/dir", "--demo"])
                .unwrap();
        assert_eq!(cli.port, 8123);
        assert_eq!(cli.data_dir, Some(PathBuf::from("some/dir")));
        assert!(cli.demo);
    }

    #[test]
    fn rejects_a_port_that_is_not_a_number() {
        assert!(Cli::try_parse_from(["bin", "--port", "http"]).is_err());
    }
}
