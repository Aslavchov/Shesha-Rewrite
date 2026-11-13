//! The local server: a JSON API under `/api` plus the embedded frontend.
//!
//! `main.rs` only calls [`startup::run`]. Tests build the same router with
//! [`router`] and drive it in memory.

pub mod api;
pub mod assets;
pub mod build_info;
pub mod cli;
pub mod config;
pub mod db;
pub mod error;
pub mod forms;
pub mod router;
pub mod serve;
pub mod startup;

pub use router::{AppState, router};
