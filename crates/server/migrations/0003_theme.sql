-- The app's one theme (ADR 0010), as two JSON documents in a single row: the
-- published theme, which everyone sees, and the draft the theme editor saves.
-- Both start as the empty theme, which is the built-in look.
--
-- `draft_revision` goes up by one on every change to the draft; a write names
-- the revision it was based on, so two editors cannot overwrite each other.
-- `published_revision` goes up by one every time a different theme is
-- published.
CREATE TABLE theme (
    id                 INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    published_document TEXT NOT NULL,
    published_revision INTEGER NOT NULL DEFAULT 1,
    -- UTC, RFC 3339 with milliseconds.
    published_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    draft_document     TEXT NOT NULL,
    draft_revision     INTEGER NOT NULL DEFAULT 1,
    draft_updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO theme (id, published_document, draft_document)
VALUES (1, '{"formatVersion":1}', '{"formatVersion":1}');

UPDATE app_meta SET value = '3' WHERE key = 'schema_version';
