//! Facts fixed at compile time.

/// The workspace version (`[workspace.package] version`).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Short git SHA of the build, or "dev". Resolved by `build.rs`.
pub const COMMIT: &str = env!("SERVER_BUILD_COMMIT");
