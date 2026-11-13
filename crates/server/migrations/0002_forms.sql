-- Forms. `document` is the form document as JSON (ADR 0003); `name` and
-- `description` are copies of the document's own, kept for listing.
--
-- `revision` starts at 1 and goes up by one on every update. An update names
-- the revision it was based on, so two editors cannot overwrite each other.
CREATE TABLE forms (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    document    TEXT NOT NULL,
    revision    INTEGER NOT NULL DEFAULT 1,
    -- UTC, RFC 3339 with milliseconds.
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX forms_by_updated_at ON forms (updated_at DESC);

UPDATE app_meta SET value = '2' WHERE key = 'schema_version';
