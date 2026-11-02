-- Sales and losses keep a snapshot of price and cost at the time they happen,
-- so later catalogue changes never rewrite past margins.
CREATE TABLE sale (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER NOT NULL REFERENCES product(id),
    day            TEXT NOT NULL,                -- YYYY-MM-DD
    qty            REAL NOT NULL CHECK (qty > 0),
    unit_price_ht  REAL NOT NULL,
    unit_cost_ht   REAL NOT NULL,
    stock_shortfall REAL NOT NULL DEFAULT 0,     -- sold but not available in stock
    source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sale_day ON sale(day);

CREATE TABLE loss (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES product(id),
    lot_id      INTEGER REFERENCES lot(id),      -- NULL when taken FEFO across several lots
    day         TEXT NOT NULL,
    qty         REAL NOT NULL CHECK (qty > 0),
    reason      TEXT NOT NULL CHECK (reason IN
                ('dlc_depassee', 'casse', 'erreur_preparation', 'non_conformite_reception')),
    cost_ht     REAL NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_loss_day ON loss(day);
