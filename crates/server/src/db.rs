//! The SQLite database: one file in the data directory, created on first run
//! and brought up to date by the migrations embedded from `migrations/`.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;
use std::{fs, io};

use sqlx::SqlitePool;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};

use crate::forms;

pub static MIGRATOR: Migrator = sqlx::migrate!();

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const PING_TIMEOUT: Duration = Duration::from_secs(2);

/// Opens the database ready for use. With `demo`, first puts it back to the
/// seed state.
pub async fn prepare(path: &Path, demo: bool) -> Result<SqlitePool, sqlx::Error> {
    if demo {
        delete(path)?;
    }
    let pool = open(path).await?;
    if demo {
        seed(&pool).await?;
    }
    Ok(pool)
}

/// Opens (creating if needed) the database file and applies any migrations
/// it has not seen yet.
pub async fn open(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
        .busy_timeout(BUSY_TIMEOUT);
    let pool = SqlitePoolOptions::new().connect_with(options).await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

/// Whether the database answers a trivial query in reasonable time.
pub async fn is_reachable(pool: &SqlitePool) -> bool {
    let query = sqlx::query("SELECT 1").execute(pool);
    match tokio::time::timeout(PING_TIMEOUT, query).await {
        Ok(Ok(_)) => true,
        Ok(Err(e)) => {
            tracing::warn!("database check failed: {e}");
            false
        }
        Err(_) => {
            tracing::warn!("database check timed out after {PING_TIMEOUT:?}");
            false
        }
    }
}

/// Demo data for `--demo`: what each phase adds on top of the migrations.
async fn seed(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    forms::seed::insert(pool).await
}

/// Removes the database file and the write-ahead-log files SQLite keeps
/// beside it. Must not be called while the database is open.
fn delete(path: &Path) -> io::Result<()> {
    for suffix in ["", "-wal", "-shm"] {
        let mut file = OsString::from(path);
        file.push(suffix);
        match fs::remove_file(&file) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn meta(pool: &SqlitePool, key: &str) -> Option<String> {
        sqlx::query_scalar("SELECT value FROM app_meta WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn first_run_creates_the_file_and_app_meta() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");

        let pool = open(&path).await.unwrap();

        assert!(path.is_file());
        let newest = MIGRATOR.iter().map(|m| m.version).max().unwrap();
        assert_eq!(
            meta(&pool, "schema_version").await,
            Some(newest.to_string())
        );
        pool.close().await;
    }

    #[tokio::test]
    async fn reopening_keeps_existing_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");

        let pool = open(&path).await.unwrap();
        sqlx::query("INSERT INTO app_meta (key, value) VALUES ('marker', 'x')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let pool = prepare(&path, false).await.unwrap();
        assert_eq!(meta(&pool, "marker").await, Some("x".to_owned()));
        pool.close().await;
    }

    #[tokio::test]
    async fn demo_resets_to_the_seed_state() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");

        let pool = open(&path).await.unwrap();
        sqlx::query("INSERT INTO app_meta (key, value) VALUES ('marker', 'x')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let pool = prepare(&path, true).await.unwrap();
        assert_eq!(meta(&pool, "marker").await, None);
        assert!(meta(&pool, "schema_version").await.is_some());
        pool.close().await;
    }

    #[tokio::test]
    async fn pragmas_are_applied() {
        let dir = tempfile::tempdir().unwrap();
        let pool = open(&dir.path().join("test.db")).await.unwrap();

        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(journal, "wal");
        assert_eq!(foreign_keys, 1);
        pool.close().await;
    }

    #[tokio::test]
    async fn a_closed_pool_is_not_reachable() {
        let dir = tempfile::tempdir().unwrap();
        let pool = open(&dir.path().join("test.db")).await.unwrap();
        assert!(is_reachable(&pool).await);

        pool.close().await;
        assert!(!is_reachable(&pool).await);
    }
}
