const { httpError, tx } = require('../utils/http');
const { dayString, fefoConsume } = require('./stock');
const { productUnitCost } = require('./costs');

const REASONS = ['dlc_depassee', 'casse', 'erreur_preparation', 'non_conformite_reception'];

function lotQty(db, lotId) {
    return db.prepare('SELECT COALESCE(SUM(delta), 0) AS q FROM stock_move WHERE lot_id = ?').get(lotId).q;
}

// A loss takes stock out with a reason. With a lot_id it empties that lot (even a
// non-conform or expired one); otherwise it takes FEFO across lots, expired included.
function createLoss(db, input, { now = new Date() } = {}) {
    const product = db.prepare('SELECT * FROM product WHERE id = ?').get(input.product_id);
    if (!product) throw httpError(404, 'Produit introuvable');
    const qty = Number(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw httpError(400, 'qty doit etre > 0');
    if (!REASONS.includes(input.reason)) throw httpError(400, `reason doit etre: ${REASONS.join(', ')}`);

    return tx(db, () => {
        let lotId = null;
        if (input.lot_id) {
            const lot = db.prepare('SELECT * FROM lot WHERE id = ?').get(input.lot_id);
            if (!lot || lot.product_id !== product.id) throw httpError(404, 'Lot introuvable pour ce produit');
            const available = lotQty(db, lot.id);
            if (qty > available) throw httpError(409, `Le lot ne contient que ${available}`);
            lotId = lot.id;
        }
        const cost = productUnitCost(db, product.id) * qty;
        const id = db.prepare(
            'INSERT INTO loss (product_id, lot_id, day, qty, reason, cost_ht, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(product.id, lotId, dayString(now), qty, input.reason, cost, input.note || null).lastInsertRowid;
        if (lotId) {
            db.prepare(`INSERT INTO stock_move (lot_id, delta, reason, ref) VALUES (?, ?, 'loss', ?)`).run(lotId, -qty, `loss:${id}`);
        } else {
            fefoConsume(db, product.id, qty, { reason: 'loss', ref: `loss:${id}`, includeExpired: true });
        }
        return db.prepare('SELECT * FROM loss WHERE id = ?').get(id);
    });
}

function listLosses(db, { from, to } = {}) {
    return db.prepare(
        `SELECT l.*, p.name, p.unit FROM loss l JOIN product p ON p.id = l.product_id
         WHERE l.day >= ? AND l.day <= ? ORDER BY l.id DESC`
    ).all(from || '0000-00-00', to || '9999-12-31');
}

module.exports = { REASONS, createLoss, listLosses };
