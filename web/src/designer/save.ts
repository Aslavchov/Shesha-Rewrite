import type { FormDocument, FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

/**
 * Autosave for the designer (spec 3.8, frozen by ADR 0008).
 *
 * A change is saved shortly after the last edit. Every save states the
 * revision it was based on; if the server has moved on (409), autosave stops
 * for good and says so, and nothing is overwritten. Plain TypeScript, no
 * React: the designer tells it when the document changes and shows its status.
 */

export type SaveStatus =
  | { readonly kind: "saved" }
  /** A change is waiting to be sent, or is being sent. */
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly reason: string }
  /** The form was changed somewhere else. Nothing more is saved until a reload. */
  | { readonly kind: "conflict" }

const SAVED: SaveStatus = { kind: "saved" }
const SAVING: SaveStatus = { kind: "saving" }
const CONFLICT: SaveStatus = { kind: "conflict" }

/** How long after the last edit a save is sent. */
export const AUTOSAVE_DELAY_MS = 700

/** The server's code for a save based on a revision that is no longer current. */
const REVISION_CONFLICT = "revision_conflict"

/**
 * `D` is the document being saved and `R` what the server answers with. They
 * default to a form's; the theme editor saves its draft the same way
 * (ADR 0010).
 */
export type SendSave<D = FormDocument, R extends { revision: number } = FormRecord> = (
  revision: number,
  document: D,
  options: { keepalive: boolean },
) => Promise<R>

export class Autosave<D = FormDocument, R extends { revision: number } = FormRecord> {
  readonly #send: SendSave<D, R>
  readonly #delay: number
  readonly #onSaved: (record: R) => void
  readonly #listeners = new Set<() => void>()
  #status: SaveStatus = SAVED
  #revision: number
  /** The document the server has. */
  #saved: D
  /** The document on screen. */
  #current: D
  /** The document on its way to the server. */
  #sending: D | null = null
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: {
    record: { revision: number; document: D }
    send: SendSave<D, R>
    delay?: number
    onSaved?: (record: R) => void
  }) {
    this.#revision = options.record.revision
    this.#saved = options.record.document
    this.#current = options.record.document
    this.#send = options.send
    this.#delay = options.delay ?? AUTOSAVE_DELAY_MS
    this.#onSaved = options.onSaved ?? (() => {})
  }

  readonly getStatus = (): SaveStatus => this.#status

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** The revision the next save will be based on. */
  get revision(): number {
    return this.#revision
  }

  /**
   * Tells autosave what the document is now. Documents are compared by
   * identity, so undoing back to what was saved needs no save at all.
   */
  changed(document: D): void {
    if (document === this.#current) return
    this.#current = document
    if (this.#status.kind === "conflict") return
    clearTimeout(this.#timer)
    if (this.#sending) return
    if (document === this.#saved) {
      this.#set(SAVED)
      return
    }
    this.#set(SAVING)
    this.#timer = setTimeout(() => this.#save(false), this.#delay)
  }

  /** Saves now if there is anything to save: for when the designer is being left. */
  flush(options: { keepalive?: boolean } = {}): void {
    clearTimeout(this.#timer)
    this.#save(options.keepalive ?? false)
  }

  /** Tries again after a failure. */
  retry(): void {
    if (this.#status.kind === "failed") this.flush()
  }

  /** Starts again from what the server has now: after a conflict was reloaded. */
  restart(record: { revision: number; document: D }): void {
    clearTimeout(this.#timer)
    this.#revision = record.revision
    this.#saved = record.document
    this.#current = record.document
    this.#set(SAVED)
  }

  /**
   * Sends what is waiting, and resolves with the status once nothing is on
   * its way: for an action that needs the server to have the latest document
   * first (publishing a theme).
   */
  settle(): Promise<SaveStatus> {
    this.flush()
    if (this.#status.kind !== "saving") return Promise.resolve(this.#status)
    return new Promise((resolve) => {
      const unsubscribe = this.subscribe(() => {
        if (this.#status.kind === "saving") return
        unsubscribe()
        resolve(this.#status)
      })
    })
  }

  /** Stops the timer. A save already on its way still completes. */
  dispose(): void {
    clearTimeout(this.#timer)
  }

  #save(keepalive: boolean): void {
    if (this.#sending || this.#status.kind === "conflict" || this.#current === this.#saved) return
    const document = this.#current
    this.#sending = document
    this.#set(SAVING)

    this.#send(this.#revision, document, { keepalive }).then(
      (record) => {
        this.#sending = null
        this.#revision = record.revision
        this.#saved = document
        this.#onSaved(record)
        // Edited again while this was on its way: save that too, at once.
        if (this.#current === document) this.#set(SAVED)
        else this.#save(false)
      },
      (error: unknown) => {
        this.#sending = null
        if (error instanceof ApiRequestError && error.code === REVISION_CONFLICT) {
          this.#set(CONFLICT)
        } else {
          this.#set({ kind: "failed", reason: reasonOf(error) })
        }
      },
    )
  }

  #set(status: SaveStatus): void {
    if (status === this.#status) return
    this.#status = status
    for (const listener of this.#listeners) listener()
  }
}

function reasonOf(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "Something went wrong while saving."
  const [first] = error.details
  // Where the server says what is wrong and where, pass that on.
  return first ? `${error.message} ${first.path}: ${first.message}` : error.message
}
