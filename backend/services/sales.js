const { httpError, tx } = require('../utils/http');
const { dayString, fefoConsume, availableLots } = require('./stock');
const { productUnitCost } = require('./costs');
const { parseCsv, parseNumber, parseDate } = require('./csv');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Records sales and takes the stock out FEFO. A sale is real revenue even when the
// stock count was wrong: what stock cannot cover is kept as `stock_shortfall`.
function createSales(db, { date, lines, source = 'manual' }, { now = new Date() } = {}) {
    const today = dayString(now);
    const day = date || today;
    if (!DATE_RE.test(day)) throw httpError(400, 'date doit etre au format AAAA-MM-JJ');
    if (!Array.isArray(lines) || !lines.length) throw httpError(400, 'lines requis');

    return tx(db, () => {
        const insert = db.prepare(
            `INSERT INTO sale (product_id, day, qty, unit_price_ht, unit_cost_ht, stock_shortfall, source)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        const sales = [];
        const shortfalls = [];
        for (const line of lines) {
            const product = db.prepare('SELECT * FROM product WHERE id = ?').get(line.product_id);
            if (!product) throw httpError(404, `Produit ${line.product_id} introuvable`);
            const qty = Number(line.qty);
            if (!Number.isFinite(qty) || qty <= 0) throw httpError(400, `qty invalide pour ${product.name}`);
            const price = line.unit_price_ht === undefined || line.unit_price_ht === null || line.unit_price_ht === ''
                ? product.sell_ht : Number(line.unit_price_ht);
            if (!Number.isFinite(price) || price < 0) throw httpError(400, `prix invalide pour ${product.name}`);

            const available = availableLots(db, product.id, { today }).reduce((s, l) => s + l.qty, 0);
            const take = Math.min(qty, available);
            const shortfall = qty - take;
            const id = insert.run(product.id, day, qty, price, productUnitCost(db, product.id), shortfall, source).lastInsertRowid;
            if (take > 0) fefoConsume(db, product.id, take, { reason: 'sale', ref: `sale:${id}`, today });
            sales.push(db.prepare('SELECT * FROM sale WHERE id = ?').get(id));
            if (shortfall > 0) shortfalls.push({ product_id: product.id, name: product.name, shortfall });
        }
        return { sales, shortfalls };
    });
}

const COLUMN_ALIASES = {
    date: ['date', 'jour'],
    product: ['produit', 'product', 'article', 'nom', 'name', 'libelle', 'ean', 'code'],
    qty: ['quantite', 'quantity', 'qty', 'qte'],
    price: ['prix', 'price', 'prix_ht', 'pu', 'prix unitaire'],
};
const norm = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function findColumn(header, kind, mapping) {
    if (mapping && mapping[kind]) {
        const i = header.findIndex(h => norm(h) === norm(mapping[kind]));
        if (i < 0) throw httpError(400, `Colonne introuvable: ${mapping[kind]}`);
        return i;
    }
    return header.findIndex(h => COLUMN_ALIASES[kind].includes(norm(h)));
}

// Import a POS export. The exact format depends on the cash register (open question),
// so columns are detected by name and can be remapped. All or nothing: any bad line
// is reported and nothing is recorded.
function importSalesCsv(db, { csv, mapping, date }, opts) {
    const rows = parseCsv(csv || '');
    if (rows.length < 2) throw httpError(400, 'CSV vide');
    const header = rows[0];
    const col = {
        date: findColumn(header, 'date', mapping),
        product: findColumn(header, 'product', mapping),
        qty: findColumn(header, 'qty', mapping),
        price: findColumn(header, 'price', mapping),
    };
    if (col.product < 0 || col.qty < 0) {
        throw httpError(400, `Colonnes produit et quantite introuvables (en-tetes: ${header.join(', ')})`);
    }

    const errors = [];
    const byDay = new Map();
    rows.slice(1).forEach((r, idx) => {
        const line = idx + 2;
        const key = String(r[col.product] ?? '').trim();
        const product = db.prepare('SELECT id FROM product WHERE ean = ? OR name = ? COLLATE NOCASE').get(key, key);
        if (!product) return errors.push({ line, message: `Produit inconnu: ${key}` });
        const qty = parseNumber(r[col.qty]);
        if (!Number.isFinite(qty) || qty <= 0) return errors.push({ line, message: `Quantite invalide: ${r[col.qty]}` });
        let day = date || null;
        if (col.date >= 0) {
            day = parseDate(r[col.date]);
            if (!day) return errors.push({ line, message: `Date invalide: ${r[col.date]}` });
        }
        const entry = { product_id: product.id, qty };
        if (col.price >= 0 && String(r[col.price]).trim() !== '') {
            const price = parseNumber(r[col.price]);
            if (!Number.isFinite(price) || price < 0) return errors.push({ line, message: `Prix invalide: ${r[col.price]}` });
            entry.unit_price_ht = price;
        }
        const k = day || '';
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(entry);
    });
    if (errors.length) return { imported: 0, errors };

    return tx(db, () => {
        let imported = 0;
        const shortfalls = [];
        for (const [day, lines] of byDay) {
            const r = createSales(db, { date: day || undefined, lines, source: 'csv' }, opts);
            imported += r.sales.length;
            shortfalls.push(...r.shortfalls);
        }
        return { imported, errors: [], shortfalls };
    });
}

function listSales(db, { from, to } = {}) {
    return db.prepare(
        `SELECT s.*, p.name, p.unit, u.name AS user_name FROM sale s JOIN product p ON p.id = s.product_id
         LEFT JOIN app_user u ON u.id = s.user_id WHERE s.day >= ? AND s.day <= ? ORDER BY s.day DESC, s.id DESC`
    ).all(from || '0000-00-00', to || '9999-12-31');
}

module.exports = { createSales, importSalesCsv, listSales };
