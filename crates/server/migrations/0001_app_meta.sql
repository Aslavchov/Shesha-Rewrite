-- Key/value facts about this database.
--
-- `schema_version` is the version of the newest migration applied. Every
-- later migration ends by updating it to its own number; a test keeps the
-- two in step.
CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) STRICT;

INSERT INTO app_meta (key, value) VALUES ('schema_version', '1');
