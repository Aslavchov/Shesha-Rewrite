//! Listening: picking a port, serving, and shutting down cleanly.

use std::io;
use std::net::Ipv4Addr;

use axum::Router;
use tokio::net::TcpListener;

/// How many consecutive ports are tried, starting with the requested one.
pub const PORT_ATTEMPTS: u16 = 20;

#[derive(Debug, thiserror::Error)]
pub enum BindError {
    #[error("no free port between {first} and {last}; pick another with --port")]
    NoFreePort { first: u16, last: u16 },

    #[error("cannot listen on 127.0.0.1:{port}")]
    Io {
        port: u16,
        #[source]
        source: io::Error,
    },
}

/// Binds `127.0.0.1:port`, or the next free port after it if that is busy.
pub async fn bind(port: u16) -> Result<TcpListener, BindError> {
    let last = port.saturating_add(PORT_ATTEMPTS - 1);
    for candidate in port..=last {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, candidate)).await {
            Ok(listener) => return Ok(listener),
            Err(e) if is_port_taken(&e) => {
                tracing::info!("port {candidate} is busy, trying the next one");
            }
            Err(source) => {
                return Err(BindError::Io {
                    port: candidate,
                    source,
                });
            }
        }
    }
    Err(BindError::NoFreePort { first: port, last })
}

/// Windows reports a port that another process holds exclusively, or that
/// the system has reserved, as "permission denied" rather than "in use".
fn is_port_taken(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::AddrInUse | io::ErrorKind::PermissionDenied
    )
}

/// Serves until `shutdown` hears Ctrl+C (or SIGTERM), then lets in-flight
/// requests finish.
pub async fn run(listener: TcpListener, app: Router, shutdown: ShutdownSignal) -> io::Result<()> {
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown.received())
        .await
}

/// The request to stop: Ctrl+C, or SIGTERM on Unix.
///
/// The handlers are installed when this is created, not when it is first
/// awaited. Create it before announcing the address: a Ctrl+C that arrives
/// between "the address was printed" and "the server is serving" must still
/// be a clean shutdown, not the operating system's default of killing the
/// process.
pub struct ShutdownSignal {
    #[cfg(unix)]
    interrupt: Option<tokio::signal::unix::Signal>,
    #[cfg(unix)]
    terminate: Option<tokio::signal::unix::Signal>,
    #[cfg(windows)]
    ctrl_c: Option<tokio::signal::windows::CtrlC>,
}

impl ShutdownSignal {
    /// Installs the handlers. If one cannot be installed, that signal is
    /// never heard: stopping the server because we cannot listen for "stop"
    /// would be the wrong way round.
    pub fn install() -> Self {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{SignalKind, signal};
            let listen = |kind: SignalKind, name: &str| {
                signal(kind)
                    .inspect_err(|e| tracing::warn!("cannot listen for {name}: {e}"))
                    .ok()
            };
            Self {
                interrupt: listen(SignalKind::interrupt(), "Ctrl+C"),
                terminate: listen(SignalKind::terminate(), "SIGTERM"),
            }
        }
        #[cfg(windows)]
        {
            Self {
                ctrl_c: tokio::signal::windows::ctrl_c()
                    .inspect_err(|e| tracing::warn!("cannot listen for Ctrl+C: {e}"))
                    .ok(),
            }
        }
    }

    /// Resolves when the process is asked to stop.
    #[cfg(unix)]
    async fn received(mut self) {
        tokio::select! {
            () = heard(&mut self.interrupt) => {}
            () = heard(&mut self.terminate) => {}
        }
        tracing::info!("shutting down");
    }

    /// Resolves when the process is asked to stop.
    #[cfg(windows)]
    async fn received(mut self) {
        match &mut self.ctrl_c {
            Some(ctrl_c) => {
                ctrl_c.recv().await;
            }
            None => std::future::pending::<()>().await,
        }
        tracing::info!("shutting down");
    }
}

/// Waits for a signal on `stream`; forever if its handler was not installed.
#[cfg(unix)]
async fn heard(stream: &mut Option<tokio::signal::unix::Signal>) {
    match stream {
        Some(stream) => {
            stream.recv().await;
        }
        None => std::future::pending::<()>().await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // One test, so the two scenarios cannot take each other's ports when
    // tests run in parallel.
    #[tokio::test]
    async fn uses_the_requested_port_or_the_next_free_one() {
        // Find a free port by asking the OS, then release it.
        let port = bind(0).await.unwrap().local_addr().unwrap().port();

        let first = bind(port).await.unwrap();
        assert_eq!(first.local_addr().unwrap().port(), port);
        assert!(first.local_addr().unwrap().ip().is_loopback());

        // `port` is now busy, so asking for it again must move on.
        let second = bind(port).await.unwrap();
        let chosen = second.local_addr().unwrap().port();
        assert!(
            chosen > port && chosen - port < PORT_ATTEMPTS,
            "expected a port just after {port}, got {chosen}"
        );
    }

    #[tokio::test]
    async fn gives_up_with_a_clear_error_when_every_candidate_is_busy() {
        // The last port: there is nothing after it to fall back to.
        let Ok(_occupied) = TcpListener::bind((Ipv4Addr::LOCALHOST, u16::MAX)).await else {
            return; // Port 65535 belongs to someone else on this machine.
        };

        let error = bind(u16::MAX).await.unwrap_err();
        assert!(matches!(
            error,
            BindError::NoFreePort {
                first: u16::MAX,
                last: u16::MAX
            }
        ));
    }
}
