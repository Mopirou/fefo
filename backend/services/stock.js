const { httpError, tx } = require('../utils/http');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Max reception temperature per product temperature class (above = delivery refused).
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

    // Too warm on arrival = refused automatically (cold chain broken), whatever the checkbox says.
    const warnings = [];
    let refusal = input.conform === false || input.conform === 0 ? 'manuel' : null;
    const max = RECV_MAX[product.temp_class];
    if (recvTemp !== null && max !== undefined && recvTemp > max) {
        refusal = 'temperature';
        warnings.push(`Livraison REFUSEE: ${recvTemp} C a reception, maximum ${max} C pour ce produit`);
    }

    return tx(db, () => {
        const info = db.prepare(
            `INSERT INTO lot (product_id, lot_no, dlc, recv_temp, conform, refusal_reason, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(product.id, input.lot_no || null, dlc, recvTemp, refusal ? 0 : 1, refusal, input.note || null);
        db.prepare(`INSERT INTO stock_move (lot_id, delta, reason) VALUES (?, ?, 'receipt')`)
            .run(info.lastInsertRowid, qty);
        return { lot: getLot(db, info.lastInsertRowid), refused: !!refusal, warnings };
    });
}

// Every real reference of the article a product belongs to ("Citron" -> Aldi, Metro...),
// with what is in stock for each; in-stock first, earliest DLC first. A product without
// article stands alone.
function productOptions(db, productId, { today = dayString() } = {}) {
    const p = getProduct(db, productId);
    const rows = p.article_id
        ? db.prepare('SELECT * FROM product WHERE article_id = ?').all(p.article_id)
        : [p];
    return rows.map(r => {
        const lots = availableLots(db, r.id, { today });
        return {
            product_id: r.id, name: r.name, supplier: r.supplier, unit: r.unit,
            qty: lots.reduce((s, l) => s + l.qty, 0), next_dlc: lots.find(l => l.dlc)?.dlc ?? null,
        };
    }).sort((a, b) => (b.qty > 0) - (a.qty > 0)
        || (a.next_dlc ?? '9999').localeCompare(b.next_dlc ?? '9999') || a.product_id - b.product_id);
}

// History of refused deliveries, most recent first.
function refusedReceipts(db) {
    return db.prepare(
        `SELECT l.id AS lot_id, l.lot_no, l.dlc, l.received_at, l.recv_temp, l.refusal_reason, l.note,
                p.id AS product_id, p.name, p.unit, p.temp_class,
                COALESCE((SELECT SUM(delta) FROM stock_move m WHERE m.lot_id = l.id AND m.reason = 'receipt'), 0) AS qty
         FROM lot l JOIN product p ON p.id = l.product_id
         WHERE l.conform = 0 AND l.source = 'supplier'
         ORDER BY l.received_at DESC, l.id DESC`
    ).all().map(r => ({ ...r, max_temp: RECV_MAX[r.temp_class] ?? null }));
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
    const product = getProduct(db, productId);
    let remaining = positive(qty, 'qty');
    const lots = availableLots(db, productId, { today, includeExpired });
    const total = lots.reduce((s, l) => s + l.qty, 0);
    if (total < remaining) throw httpError(409, `Stock insuffisant pour ${product.name}: ${total} ${product.unit} disponible, ${remaining} ${product.unit} demande`);

    const insert = db.prepare('INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, ?, ?, ?)');
    return tx(db, () => {
        const taken = [];
        for (const lot of lots) {
            if (remaining <= 0) break;
            const take = Math.min(lot.qty, remaining);
            insert.run(lot.id, -take, reason, ref);
            taken.push({ lot_id: lot.id, lot_no: lot.lot_no, dlc: lot.dlc, qty: take });
            remaining -= take;
        }
        return taken;
    });
}

// One row per product: total available quantity (conform lots only) and nearest DLC.
function stockSummary(db) {
    return db.prepare(
        `SELECT p.id AS product_id, p.name, p.category, p.unit, p.min_stock, p.temp_class,
                p.supplier, a.name AS article, COALESCE(s.qty, 0) AS qty, s.next_dlc
         FROM product p LEFT JOIN article a ON a.id = p.article_id LEFT JOIN (
             SELECT product_id, SUM(qty) AS qty, MIN(dlc) AS next_dlc FROM (
                 SELECT l.product_id, l.dlc, COALESCE(SUM(m.delta), 0) AS qty
                 FROM lot l LEFT JOIN stock_move m ON m.lot_id = l.id
                 WHERE l.conform = 1 GROUP BY l.id HAVING qty > 0
             ) GROUP BY product_id
         ) s ON s.product_id = p.id
         ORDER BY COALESCE(a.name, p.name) COLLATE NOCASE, p.name COLLATE NOCASE`
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
    return tx(db, () => {
        const results = [];
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
        return results;
    });
}

module.exports = { dayString, receive, refusedReceipts, productOptions, getLot, availableLots, fefoConsume, stockSummary, alerts, applyInventory };
