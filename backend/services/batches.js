const { httpError, tx } = require('../utils/http');
const { dayString, fefoConsume } = require('./stock');
const { getRecipe } = require('./recipes');
const { getSetting } = require('./settings');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BATCH_SQL = `
    SELECT b.*, r.name, p.unit, l.lot_no, l.dlc AS current_dlc,
           COALESCE((SELECT SUM(delta) FROM stock_move WHERE lot_id = b.lot_id), 0) AS stock_qty
    FROM prep_batch b
    JOIN recipe r ON r.id = b.recipe_id
    JOIN lot l ON l.id = b.lot_id
    JOIN product p ON p.id = r.output_product_id`;

function getBatch(db, id) {
    const batch = db.prepare(`${BATCH_SQL} WHERE b.id = ?`).get(id);
    if (!batch) throw httpError(404, 'Lot fabrique introuvable');
    batch.sources = db.prepare(
        `SELECT s.lot_id, s.qty, l.lot_no, l.dlc, p.name AS product_name
         FROM prep_batch_source s JOIN lot l ON l.id = s.lot_id JOIN product p ON p.id = l.product_id
         WHERE s.batch_id = ? ORDER BY s.rowid`
    ).all(id);
    return batch;
}

function listBatches(db) {
    return db.prepare(`${BATCH_SQL} ORDER BY b.id DESC LIMIT 200`).all();
}

// Rule: DLC of a chilled preparation is at most `prep_dlc_max_days` after the day of
// manufacture, unless a justification is recorded.
function createBatch(db, input, { now = new Date() } = {}) {
    const recipe = getRecipe(db, input.recipe_id);
    const qty = input.qty === undefined || input.qty === '' ? recipe.yield_qty : Number(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw httpError(400, 'qty doit etre > 0');

    const today = dayString(now);
    const maxDlc = dayString(now, getSetting(db, 'prep_dlc_max_days'));
    const dlc = input.dlc ? String(input.dlc) : dayString(now, recipe.default_dlc_days);
    if (!DATE_RE.test(dlc)) throw httpError(400, 'dlc doit etre au format AAAA-MM-JJ');
    if (dlc < today) throw httpError(400, 'dlc deja depassee');
    const justification = input.justification ? String(input.justification).trim() : null;
    if (dlc > maxDlc && !justification) {
        throw httpError(400, `DLC au-dela de ${maxDlc}: justification requise`);
    }

    return tx(db, () => {
        const lotId = db.prepare(`INSERT INTO lot (product_id, dlc, source) VALUES (?, ?, 'prep')`)
            .run(recipe.output_product_id, dlc).lastInsertRowid;
        const batchId = db.prepare(
            `INSERT INTO prep_batch (recipe_id, lot_id, qty, made_at, dlc, justification) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(recipe.id, lotId, qty, today, dlc, dlc > maxDlc ? justification : null).lastInsertRowid;
        db.prepare('UPDATE lot SET lot_no = ? WHERE id = ?').run(`P${today.replace(/-/g, '')}-${batchId}`, lotId);

        const addSource = db.prepare('INSERT INTO prep_batch_source (batch_id, lot_id, qty) VALUES (?, ?, ?)');
        for (const item of recipe.items) {
            const needed = item.qty * qty / recipe.yield_qty;
            const taken = fefoConsume(db, item.product_id, needed, { reason: 'prep_use', ref: `batch:${batchId}`, today });
            for (const t of taken) addSource.run(batchId, t.lot_id, t.qty);
        }
        db.prepare(`INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, ?, 'prep_out', ?)`)
            .run(lotId, qty, `batch:${batchId}`);
        return getBatch(db, batchId);
    });
}

// Freezing is only possible on a fresh batch, on or before its DLC. A thawed batch
// can never be frozen again.
function freeze(db, id, { now = new Date() } = {}) {
    const b = getBatch(db, id);
    if (b.state === 'thawed') throw httpError(409, 'Recongelation interdite');
    if (b.state === 'frozen') throw httpError(409, 'Deja congele');
    if (dayString(now) > b.dlc) throw httpError(409, 'Congelation impossible apres la DLC');
    return tx(db, () => {
        db.prepare(`UPDATE prep_batch SET state = 'frozen', frozen_at = ? WHERE id = ?`).run(dayString(now), id);
        db.prepare('UPDATE lot SET dlc = NULL WHERE id = ?').run(b.lot_id);
        db.prepare(`INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, 0, 'freeze', ?)`).run(b.lot_id, `batch:${id}`);
        return getBatch(db, id);
    });
}

function thaw(db, id, { now = new Date() } = {}) {
    const b = getBatch(db, id);
    if (b.state !== 'frozen') throw httpError(409, 'Seul un lot congele peut etre decongele');
    const hours = getSetting(db, 'thaw_dlc_hours');
    const dlc = dayString(new Date(now.getTime() + hours * 3600 * 1000));
    return tx(db, () => {
        db.prepare(`UPDATE prep_batch SET state = 'thawed', thawed_at = ? WHERE id = ?`).run(dayString(now), id);
        db.prepare('UPDATE lot SET dlc = ? WHERE id = ?').run(dlc, b.lot_id);
        db.prepare(`INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, 0, 'thaw', ?)`).run(b.lot_id, `batch:${id}`);
        return getBatch(db, id);
    });
}

// Distinct allergens of every ingredient lot used in the batch.
function batchAllergens(db, id) {
    const rows = db.prepare(
        `SELECT DISTINCT p.allergens FROM prep_batch_source s
         JOIN lot l ON l.id = s.lot_id JOIN product p ON p.id = l.product_id WHERE s.batch_id = ?`
    ).all(id);
    const set = new Set();
    for (const r of rows) for (const a of String(r.allergens).split(',')) if (a.trim()) set.add(a.trim().toLowerCase());
    return [...set].sort();
}

module.exports = { getBatch, listBatches, createBatch, freeze, thaw, batchAllergens };
