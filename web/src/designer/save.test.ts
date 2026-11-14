import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FormDocument, FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { Autosave, AUTOSAVE_DELAY_MS, type SendSave } from "./save"
import { field, form } from "./testing/documents"

const first = form()
const second = form([field("a")])
const third = form([field("a"), field("b")])

/** A server that answers when the test says so. */
function fakeServer() {
  const requests: {
    revision: number
    document: FormDocument
    keepalive: boolean
    answer: (record: FormRecord) => void
    fail: (error: unknown) => void
  }[] = []
  const send = vi.fn<SendSave>(
    (revision, document, { keepalive }) =>
      new Promise((answer, fail) => {
        requests.push({ revision, document, keepalive, answer, fail })
      }),
  )
  /** Answers the oldest unanswered request as the server would: the next revision. */
  const accept = async () => {
    const request = requests.shift()!
    request.answer({
      id: "f1",
      revision: request.revision + 1,
      updatedAt: "2026-11-13T09:15:02.417Z",
      document: request.document,
    })
    await Promise.resolve()
  }
  const reject = async (error: unknown) => {
    requests.shift()!.fail(error)
    await Promise.resolve()
    await Promise.resolve()
  }
  return { send, requests, accept, reject }
}

function setup() {
  const server = fakeServer()
  const onSaved = vi.fn()
  const autosave = new Autosave({
    record: { revision: 1, document: first },
    send: server.send,
    onSaved,
  })
  const statuses: string[] = []
  autosave.subscribe(() => statuses.push(autosave.getStatus().kind))
  return { ...server, autosave, onSaved, statuses }
}

const conflict = () =>
  new ApiRequestError("revision_conflict", "The form has changed since revision 1.", 409)

describe("autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts saved and sends nothing until the document changes", () => {
    const { autosave, send } = setup()
    vi.advanceTimersByTime(10 * AUTOSAVE_DELAY_MS)

    expect(autosave.getStatus()).toEqual({ kind: "saved" })
    expect(send).not.toHaveBeenCalled()
  })

  it("ignores being told about the document it already has", () => {
    const { autosave, send, statuses } = setup()
    autosave.changed(first)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    expect(send).not.toHaveBeenCalled()
    expect(statuses).toEqual([])
  })

  it("saves shortly after the last edit, with the revision it was based on", async () => {
    const { autosave, send, accept, onSaved } = setup()

    autosave.changed(second)
    expect(autosave.getStatus()).toEqual({ kind: "saving" })
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledExactlyOnceWith(1, second, { keepalive: false })

    await accept()
    expect(autosave.getStatus()).toEqual({ kind: "saved" })
    expect(autosave.revision).toBe(2)
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it("waits for a pause: several quick edits are one save of the last", () => {
    const { autosave, send } = setup()

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100)
    autosave.changed(third)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100)
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledExactlyOnceWith(1, third, { keepalive: false })
  })

  it("saves nothing when the document is undone back to what was saved", () => {
    const { autosave, send } = setup()

    autosave.changed(second)
    autosave.changed(first)

    expect(autosave.getStatus()).toEqual({ kind: "saved" })
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    expect(send).not.toHaveBeenCalled()
  })

  it("an edit made while a save is on its way is saved next, on the new revision", async () => {
    const { autosave, send, accept } = setup()

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    autosave.changed(third)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    // One request at a time: the second waits for the first's revision.
    expect(send).toHaveBeenCalledOnce()

    await accept()
    expect(autosave.getStatus()).toEqual({ kind: "saving" })
    expect(send).toHaveBeenLastCalledWith(2, third, { keepalive: false })

    await accept()
    expect(autosave.getStatus()).toEqual({ kind: "saved" })
    expect(autosave.revision).toBe(3)
  })

  it("on a revision conflict, stops saving for good", async () => {
    const { autosave, send, reject } = setup()

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await reject(conflict())
    expect(autosave.getStatus()).toEqual({ kind: "conflict" })

    autosave.changed(third)
    autosave.flush()
    autosave.retry()
    vi.advanceTimersByTime(10 * AUTOSAVE_DELAY_MS)
    expect(send).toHaveBeenCalledOnce()
    expect(autosave.getStatus()).toEqual({ kind: "conflict" })
  })

  it("saves again after a conflict once it is restarted from the server's copy", async () => {
    const { autosave, send, reject, accept } = setup()
    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await reject(conflict())

    autosave.restart({ revision: 5, document: third })
    expect(autosave.getStatus()).toEqual({ kind: "saved" })

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    expect(send).toHaveBeenLastCalledWith(5, second, { keepalive: false })
    await accept()
    expect(autosave.revision).toBe(6)
  })

  it("says why a save failed, and tries again on the next edit", async () => {
    const { autosave, send, reject, accept } = setup()

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await reject(new ApiRequestError("network_error", "The server could not be reached.", null))
    expect(autosave.getStatus()).toEqual({
      kind: "failed",
      reason: "The server could not be reached.",
    })

    autosave.changed(third)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    expect(send).toHaveBeenLastCalledWith(1, third, { keepalive: false })
    await accept()
    expect(autosave.getStatus()).toEqual({ kind: "saved" })
  })

  it("retries a failed save when asked", async () => {
    const { autosave, send, reject } = setup()
    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await reject(new Error("boom"))
    expect(autosave.getStatus()).toEqual({
      kind: "failed",
      reason: "Something went wrong while saving.",
    })

    autosave.retry()
    expect(send).toHaveBeenCalledTimes(2)
    expect(autosave.getStatus()).toEqual({ kind: "saving" })
  })

  it("passes on where the server says the document is wrong", async () => {
    const { autosave, reject } = setup()
    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await reject(
      new ApiRequestError("invalid_form", "The form document has 1 problem.", 400, [
        { path: "components[0].name", message: '"a b" is not a valid name.' },
      ]),
    )

    expect(autosave.getStatus()).toEqual({
      kind: "failed",
      reason: 'The form document has 1 problem. components[0].name: "a b" is not a valid name.',
    })
  })

  it("flushes a waiting change at once, and can ask for it to outlive the page", () => {
    const { autosave, send } = setup()

    autosave.flush()
    expect(send).not.toHaveBeenCalled()

    autosave.changed(second)
    autosave.flush({ keepalive: true })
    expect(send).toHaveBeenCalledExactlyOnceWith(1, second, { keepalive: true })

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    expect(send).toHaveBeenCalledOnce()
  })

  it("sends nothing after it is disposed, but lets a save on its way finish", async () => {
    const { autosave, send, accept, onSaved } = setup()

    autosave.changed(second)
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    autosave.dispose()
    await accept()
    expect(onSaved).toHaveBeenCalledOnce()

    autosave.changed(third)
    autosave.dispose()
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    expect(send).toHaveBeenCalledOnce()
  })
})
