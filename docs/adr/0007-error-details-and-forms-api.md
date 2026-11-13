# ADR 0007: The error shape's `details` field, and the forms API

- Status: accepted
- Date: 13 November 2026
- Phase: 1

## Context

Phase 0 froze the error shape: `{ "error": { "code": "...", "message": "..." } }`. Phase 1 stores form documents, and an invalid document usually has several problems at once. One sentence in `message` cannot say where each is. Frozen contracts change only through an ADR; this is that record. It also records the forms API, which is frozen after this phase.

## Decision

### `details`

The error body gains one optional member:

```json
{
  "error": {
    "code": "invalid_form",
    "message": "The form document has 2 problems.",
    "details": [
      { "path": "components[1].name", "message": "\"first name\" is not a valid name. Use letters, digits, _ and $, not starting with a digit." },
      { "path": "components[3].bind", "message": "\"email\" is already used by components[2]." }
    ]
  }
}
```

- `details` is a list of `{ path, message }`. `path` locates the problem inside the request's document, in the form `components[1].regions.col2[0].name`; `message` is a sentence for a person.
- It is **left out, not null or empty**, when there is nothing to list. Every Phase 0 error is byte-for-byte what it was, and a client that ignores `details` loses nothing: `code` and `message` are always complete.
- Any endpoint may use it for problems that have a location. In Phase 1 only `invalid_form` does.

The change is additive: no existing field changes meaning, and no existing response changes.

### The forms API

| Endpoint | Request body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/forms` | | 200 `{ "forms": [FormSummary] }`, most recently updated first | |
| `POST /api/forms` | `{ "document": FormDocument }` | 201 `FormRecord` | 400 `invalid_form`, 400 `invalid_request` |
| `GET /api/forms/{id}` | | 200 `FormRecord` | 404 `form_not_found` |
| `PUT /api/forms/{id}` | `{ "revision": n, "document": FormDocument }` | 200 `FormRecord` with the new revision | 400 `invalid_form`, 400 `invalid_request`, 404 `form_not_found`, 409 `revision_conflict` |
| `DELETE /api/forms/{id}` | | 204, no body | 404 `form_not_found` |

```
FormSummary = { id, name, description, updatedAt, revision }
FormRecord  = { id, revision, updatedAt, document }
```

- **`id`** is chosen by the server: 32 lowercase hex characters from 16 random bytes. Seeded demo forms have fixed, readable ids (`person-details`), so links to them survive a `--demo` reset.
- **`revision`** starts at 1 and goes up by one on every successful update. An update states the revision it was based on; if the stored revision differs, nothing is written and the answer is 409 `revision_conflict`. This is optimistic concurrency: no locks, and two editors can never silently overwrite each other.
- **`updatedAt`** is UTC in RFC 3339 with milliseconds (`2026-11-13T09:15:02.417Z`).
- **`name` and `description`** in a summary are copied from the document when it is stored. The document is the single source.
- **`invalid_request`** (400) means the body could not be used at all: not JSON, not an object, or missing `document` or `revision`. **`invalid_form`** (400) means the document was read and is wrong; `details` lists every problem found, not just the first.
- The list is wrapped in an object so that paging can be added later without changing its shape.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| `details` with paths | Phase 2: the designer can point at the instance a save was refused for |
| Revisions and 409 | Phase 2: saving from the designer with two tabs or two people |
| Full record returned from every write | Phase 2: the designer never needs a second request after saving |

## Consequences

- `ApiErrorBody` gains `details?: ErrorDetail[]` in `crates/contracts` and in the generated TypeScript.
- The forms API, revisions, the 409 response and `details` are frozen after this phase.
