-- Entity and reference list definitions (ADR 0011). Each is stored as the
-- JSON document an administrator edits, with a revision as for forms.
--
-- The rows of an entity live in a table of their own, `entity_<id>`, which the
-- server creates and changes as the definition changes. `id` is never reused
-- (AUTOINCREMENT), and neither is a column number: `columns` maps each
-- property name to the number N of its column `cN`, and `next_column` is the
-- next number to hand out. No table or column name ever contains text a
-- person typed.
CREATE TABLE reference_lists (
    name        TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
    definition  TEXT NOT NULL,
    revision    INTEGER NOT NULL DEFAULT 1,
    -- UTC, RFC 3339 with milliseconds.
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE entities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    definition  TEXT NOT NULL,
    columns     TEXT NOT NULL,
    next_column INTEGER NOT NULL,
    revision    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

UPDATE app_meta SET value = '4' WHERE key = 'schema_version';
