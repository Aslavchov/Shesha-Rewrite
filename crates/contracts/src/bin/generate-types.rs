//! Regenerates `web/src/generated` from the types in this crate.

use std::process::ExitCode;

use contracts::codegen;

fn main() -> ExitCode {
    let dir = codegen::output_dir();
    let files = codegen::render();
    match codegen::write(&dir, &files) {
        Ok(()) => {
            eprintln!("wrote {} files to {}", files.len(), dir.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: cannot write {}: {e}", dir.display());
            ExitCode::FAILURE
        }
    }
}
