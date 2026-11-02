CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE product (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK (category IN ('boisson', 'ingredient', 'consommable')),
    unit        TEXT NOT NULL DEFAULT 'unite',
    ean         TEXT UNIQUE,
    supplier    TEXT,
    buy_ht      REAL NOT NULL DEFAULT 0,
    sell_ht     REAL NOT NULL DEFAULT 0,
    allergens   TEXT NOT NULL DEFAULT '',
    temp_class  TEXT NOT NULL DEFAULT 'ambiant'
                CHECK (temp_class IN ('ambiant', 'positif_3', 'positif_4', 'positif_8', 'surgele')),
    favorite    INTEGER NOT NULL DEFAULT 0,
    min_stock   REAL NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_product_name ON product(name);
