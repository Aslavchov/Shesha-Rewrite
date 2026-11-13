//! The life of the process: flags, logging, database, listener, serve.

use std::error::Error;
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use contracts::APP_NAME;

use crate::assets::EmbeddedAssets;
use crate::cli::{self, Cli};
use crate::config::{self, Settings};
use crate::router::{AppState, router};
use crate::serve::{self, BindError, ShutdownSignal};
use crate::{build_info, db};

#[derive(Debug, thiserror::Error)]
enum StartupError {
    #[error("cannot work out where the executable is; pass --data-dir")]
    Executable(#[source] io::Error),

    #[error("cannot create the data folder {}", path.display())]
    DataDir {
        path: PathBuf,
        #[source]
        source: io::Error,
    },

    #[error("cannot open the database {}", path.display())]
    Database {
        path: PathBuf,
        #[source]
        source: sqlx::Error,
    },

    #[error(transparent)]
    Bind(#[from] BindError),

    #[error("the server stopped unexpectedly")]
    Serve(#[source] io::Error),
}

/// Runs the server until it is asked to stop. `bin_name` is the binary's
/// name as Cargo knows it.
pub async fn run(bin_name: &'static str) -> ExitCode {
    let cli = cli::parse(bin_name);
    init_logging();

    match start(cli, bin_name).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            report(&error);
            ExitCode::FAILURE
        }
    }
}

async fn start(cli: Cli, bin_name: &str) -> Result<(), StartupError> {
    let settings = Settings::resolve(cli, bin_name).map_err(StartupError::Executable)?;

    fs::create_dir_all(&settings.data_dir).map_err(|source| StartupError::DataDir {
        path: settings.data_dir.clone(),
        source,
    })?;
    let db_path = config::db_path(&settings.data_dir, bin_name);
    let pool = db::prepare(&db_path, settings.demo)
        .await
        .map_err(|source| StartupError::Database {
            path: db_path.clone(),
            source,
        })?;

    let listener = serve::bind(settings.port).await?;
    let port = listener
        .local_addr()
        .map_err(|source| BindError::Io {
            port: settings.port,
            source,
        })?
        .port();

    // Before the address is announced: whoever reads it may press Ctrl+C at
    // once, and that must already be a clean shutdown.
    let shutdown = ShutdownSignal::install();

    announce(port);
    tracing::info!(
        version = build_info::VERSION,
        commit = build_info::COMMIT,
        database = %db_path.display(),
        demo = settings.demo,
        "started"
    );

    let state = AppState {
        pool: pool.clone(),
        assets: Arc::new(EmbeddedAssets),
    };
    let served = serve::run(listener, router(state), shutdown).await;
    pool.close().await;
    served.map_err(StartupError::Serve)?;

    tracing::info!("stopped");
    Ok(())
}

/// The only thing this program ever writes to stdout, so that scripts (and
/// people) can read the address from it. Everything else goes to stderr.
fn announce(port: u16) {
    let line = format!("{APP_NAME} running at http://localhost:{port}");
    // A closed stdout must not stop the server.
    if let Err(e) = writeln!(io::stdout().lock(), "{line}") {
        tracing::warn!("cannot write to stdout ({e}): {line}");
    }
}

fn init_logging() {
    tracing_subscriber::fmt()
        .with_writer(io::stderr)
        .with_max_level(tracing::Level::INFO)
        .init();
}

/// Prints the error and its chain of causes to stderr.
fn report(error: &StartupError) {
    eprintln!("error: {error}");
    let mut cause = error.source();
    while let Some(error) = cause {
        eprintln!("  caused by: {error}");
        cause = error.source();
    }
}
