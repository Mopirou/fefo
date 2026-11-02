-- Cold storage units to monitor. max_temp defaults from the kind (see services/haccp.js)
-- and can be overridden per unit according to its contents.
CREATE TABLE fridge (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    kind      TEXT NOT NULL CHECK (kind IN ('preparations', 'tres_perissable', 'perissable', 'surgele')),
    max_temp  REAL NOT NULL,
    contents  TEXT,
    active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE temp_reading (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fridge_id  INTEGER NOT NULL REFERENCES fridge(id),
    day        TEXT NOT NULL,
    slot       TEXT NOT NULL CHECK (slot IN ('matin', 'soir')),
    value      REAL NOT NULL,
    max_temp   REAL NOT NULL,          -- threshold applied at the time of the reading
    alert      INTEGER NOT NULL,
    action     TEXT,                   -- corrective action taken after an alert
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reading_day ON temp_reading(day);

-- Rapid cooling of a preparation: +63 C to +10 C in under 2 h.
CREATE TABLE cooling_record (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id     INTEGER REFERENCES prep_batch(id),
    label        TEXT NOT NULL,
    day          TEXT NOT NULL,
    start_at     TEXT NOT NULL,        -- YYYY-MM-DDTHH:MM
    start_temp   REAL NOT NULL,
    end_at       TEXT NOT NULL,
    end_temp     REAL NOT NULL,
    minutes      INTEGER NOT NULL,
    alert        INTEGER NOT NULL,
    action       TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cooling_day ON cooling_record(day);

CREATE TABLE cleaning_task (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    frequency  TEXT NOT NULL CHECK (frequency IN ('quotidien', 'hebdomadaire', 'mensuel')),
    active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cleaning_check (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES cleaning_task(id),
    day        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, day)
);
