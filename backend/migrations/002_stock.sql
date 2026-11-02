-- A lot is one received (or produced) batch of a product. Its quantity is
-- never stored: it is the sum of its stock_move rows, so every change is traceable.
CREATE TABLE lot (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER NOT NULL REFERENCES product(id),
    lot_no        TEXT,
    dlc           TEXT,                       -- YYYY-MM-DD, NULL when no date applies
    received_at   TEXT NOT NULL DEFAULT (datetime('now')),
    recv_temp     REAL,
    conform       INTEGER NOT NULL DEFAULT 1, -- 0 = refused/non-conform, never available for FEFO
    note          TEXT,
    source        TEXT NOT NULL DEFAULT 'supplier' CHECK (source IN ('supplier', 'prep', 'inventory'))
);
CREATE INDEX idx_lot_product ON lot(product_id);

CREATE TABLE stock_move (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id  INTEGER NOT NULL REFERENCES lot(id),
    delta   REAL NOT NULL,
    reason  TEXT NOT NULL CHECK (reason IN
            ('receipt', 'prep_use', 'prep_out', 'sale', 'loss', 'inventory', 'freeze', 'thaw', 'manual')),
    ref     TEXT,
    ts      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_move_lot ON stock_move(lot_id);

CREATE TABLE inventory_count (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES product(id),
    theoretical REAL NOT NULL,
    counted     REAL NOT NULL,
    gap         REAL NOT NULL,
    ts          TEXT NOT NULL DEFAULT (datetime('now'))
);
