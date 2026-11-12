use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    // `CARGO_BIN_NAME` is the `[[bin]] name` from Cargo.toml and only exists
    // while compiling the binary itself, so it is handed to the library here.
    server::startup::run(env!("CARGO_BIN_NAME")).await
}
