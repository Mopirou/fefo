CREATE TABLE recipe (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL UNIQUE,
    output_product_id INTEGER NOT NULL REFERENCES product(id),
    yield_qty         REAL NOT NULL CHECK (yield_qty > 0),
    default_dlc_days  INTEGER NOT NULL DEFAULT 3 CHECK (default_dlc_days >= 0)
);

CREATE TABLE recipe_item (
    recipe_id   INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES product(id),
    qty         REAL NOT NULL CHECK (qty > 0),
    PRIMARY KEY (recipe_id, product_id)
);

-- One manufactured batch. Its stock lives in `lot_id` (source = 'prep').
-- dlc is the DLC at manufacture; the lot's own dlc is the current one
-- (NULL while frozen, recalculated on thaw).
CREATE TABLE prep_batch (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id     INTEGER NOT NULL REFERENCES recipe(id),
    lot_id        INTEGER NOT NULL REFERENCES lot(id),
    qty           REAL NOT NULL,
    made_at       TEXT NOT NULL,              -- YYYY-MM-DD
    dlc           TEXT NOT NULL,
    justification TEXT,
    state         TEXT NOT NULL DEFAULT 'fresh' CHECK (state IN ('fresh', 'frozen', 'thawed')),
    frozen_at     TEXT,
    thawed_at     TEXT
);

-- Which supplier/prep lots were consumed to make a batch (traceability).
CREATE TABLE prep_batch_source (
    batch_id  INTEGER NOT NULL REFERENCES prep_batch(id) ON DELETE CASCADE,
    lot_id    INTEGER NOT NULL REFERENCES lot(id),
    qty       REAL NOT NULL
);
CREATE INDEX idx_batch_source ON prep_batch_source(batch_id);
