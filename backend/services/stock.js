const { httpError } = require('../utils/http');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Max reception temperature per product temperature class (warning only).
const RECV_MAX = { positif_3: 3, positif_4: 4, positif_8: 8, surgele: -18 };

// Local calendar day as YYYY-MM-DD (DLC are calendar dates, not UTC instants).
function dayString(date = new Date(), offsetDays = 0) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const LOTS_SQL = `
    SELECT l.*, COALESCE(SUM(m.delta), 0) AS qty
    FROM lot l LEFT JOIN stock_move m ON m.lot_id = l.id`;

function getProduct(db, id) {
    const p = db.prepare('SELECT * FROM product WHERE id = ?').get(id);
    if (!p) throw httpError(404, 'Produit introuvable');
    return p;
}

function positive(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${label} doit etre un nombre > 0`);
    return n;
}

function receive(db, input) {
    const product = getProduct(db, input.product_id);
    const qty = positive(input.qty, 'qty');
    const dlc = input.dlc ? String(input.dlc) : null;
    if (dlc && !DATE_RE.test(dlc)) throw httpError(400, 'dlc doit etre au format AAAA-MM-JJ');
    if (!dlc && product.temp_class !== 'ambiant') throw httpError(400, 'dlc requise pour un produit froid');
    const recvTemp = input.recv_temp === undefined || input.recv_temp === null || input.recv_temp === ''
        ? null : Number(input.recv_temp);
    if (recvTemp !== null && !Number.isFinite(recvTemp)) throw httpError(400, 'recv_temp invalide');
    const conform = input.conform === false || input.conform === 0 ? 0 : 1;

    const warnings = [];
    const max = RECV_MAX[product.temp_class];
    if (recvTemp !== null && max !== undefined && recvTemp > max) {
        warnings.push(`Temperature a reception ${recvTemp} C superieure a ${max} C: envisager de refuser le lot`);
    }

    db.exec('BEGIN');
    try {
        const info = db.prepare(
            `INSERT INTO lot (product_id, lot_no, dlc, recv_temp, conform, note)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(product.id, input.lot_no || null, dlc, recvTemp, conform, input.note || null);
        db.prepare(`INSERT INTO stock_move (lot_id, delta, reason) VALUES (?, ?, 'receipt')`)
            .run(info.lastInsertRowid, qty);
        db.exec('COMMIT');
        return { lot: getLot(db, info.lastInsertRowid), warnings };
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function getLot(db, id) {
    return db.prepare(`${LOTS_SQL} WHERE l.id = ? GROUP BY l.id`).get(id);
}

// Lots of a product still holding stock, in FEFO order (earliest DLC first, undated last).
function availableLots(db, productId, { today = dayString(), includeExpired = false } = {}) {
    const rows = db.prepare(
        `${LOTS_SQL} WHERE l.product_id = ? AND l.conform = 1 GROUP BY l.id HAVING qty > 0
         ORDER BY l.dlc IS NULL, l.dlc, l.received_at, l.id`
    ).all(productId);
    return includeExpired ? rows : rows.filter(l => !l.dlc || l.dlc >= today);
}

// Takes `qty` out of the product's lots, first expired first out. All or nothing.
function fefoConsume(db, productId, qty, { reason = 'manual', ref = null, today, includeExpired = false } = {}) {
    getProduct(db, productId);
    let remaining = positive(qty, 'qty');
    const lots = availableLots(db, productId, { today, includeExpired });
    const total = lots.reduce((s, l) => s + l.qty, 0);
    if (total < remaining) throw httpError(409, `Stock insuffisant: ${total} disponible, ${remaining} demande`);

    const insert = db.prepare('INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, ?, ?, ?)');
    const taken = [];
    db.exec('BEGIN');
    try {
        for (const lot of lots) {
            if (remaining <= 0) break;
            const take = Math.min(lot.qty, remaining);
            insert.run(lot.id, -take, reason, ref);
            taken.push({ lot_id: lot.id, lot_no: lot.lot_no, dlc: lot.dlc, qty: take });
            remaining -= take;
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
    return taken;
}

// One row per product: total available quantity (conform lots only) and nearest DLC.
function stockSummary(db) {
    return db.prepare(
        `SELECT p.id AS product_id, p.name, p.category, p.unit, p.min_stock, p.temp_class,
                COALESCE(s.qty, 0) AS qty, s.next_dlc
         FROM product p LEFT JOIN (
             SELECT product_id, SUM(qty) AS qty, MIN(dlc) AS next_dlc FROM (
                 SELECT l.product_id, l.dlc, COALESCE(SUM(m.delta), 0) AS qty
                 FROM lot l LEFT JOIN stock_move m ON m.lot_id = l.id
                 WHERE l.conform = 1 GROUP BY l.id HAVING qty > 0
             ) GROUP BY product_id
         ) s ON s.product_id = p.id
         ORDER BY p.name COLLATE NOCASE`
    ).all();
}

function alerts(db, today = dayString()) {
    const tomorrow = dayString(new Date(`${today}T12:00:00`), 1);
    const lots = db.prepare(
        `SELECT l.id AS lot_id, l.lot_no, l.dlc, p.id AS product_id, p.name, COALESCE(SUM(m.delta), 0) AS qty
         FROM lot l JOIN product p ON p.id = l.product_id LEFT JOIN stock_move m ON m.lot_id = l.id
         WHERE l.conform = 1 AND l.dlc IS NOT NULL GROUP BY l.id HAVING qty > 0 ORDER BY l.dlc`
    ).all();
    return {
        low_stock: stockSummary(db).filter(s => s.min_stock > 0 && s.qty <= s.min_stock),
        dlc_expired: lots.filter(l => l.dlc < today),
        dlc_today: lots.filter(l => l.dlc === today),
        dlc_tomorrow: lots.filter(l => l.dlc === tomorrow),
    };
}

// Counts are real quantities. Shortfalls leave the lots FEFO-style (expired included);
// surplus becomes an undated 'inventory' lot. Every count is logged with its gap.
function applyInventory(db, counts) {
    if (!Array.isArray(counts) || !counts.length) throw httpError(400, 'counts requis');
    const results = [];
    db.exec('BEGIN');
    try {
        for (const c of counts) {
            getProduct(db, c.product_id);
            const counted = Number(c.counted);
            if (!Number.isFinite(counted) || counted < 0) throw httpError(400, 'counted doit etre >= 0');
            const lots = availableLots(db, c.product_id, { includeExpired: true });
            const theoretical = lots.reduce((s, l) => s + l.qty, 0);
            const gap = counted - theoretical;
            if (gap < 0) {
                let remaining = -gap;
                for (const lot of lots) {
                    if (remaining <= 0) break;
                    const take = Math.min(lot.qty, remaining);
                    db.prepare(`INSERT INTO stock_move (lot_id, delta, reason) VALUES (?, ?, 'inventory')`).run(lot.id, -take);
                    remaining -= take;
                }
            } else if (gap > 0) {
                const info = db.prepare(`INSERT INTO lot (product_id, source) VALUES (?, 'inventory')`).run(c.product_id);
                db.prepare(`INSERT INTO stock_move (lot_id, delta, reason) VALUES (?, ?, 'inventory')`).run(info.lastInsertRowid, gap);
            }
            db.prepare('INSERT INTO inventory_count (product_id, theoretical, counted, gap) VALUES (?, ?, ?, ?)')
                .run(c.product_id, theoretical, counted, gap);
            results.push({ product_id: c.product_id, theoretical, counted, gap });
        }
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
    return results;
}

module.exports = { dayString, receive, getLot, availableLots, fefoConsume, stockSummary, alerts, applyInventory };
