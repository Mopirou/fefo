const CATEGORIES = ['boisson', 'ingredient', 'consommable'];
const TEMP_CLASSES = ['ambiant', 'positif_3', 'positif_4', 'positif_8', 'surgele'];

function validate(body) {
    const errors = [];
    const name = String(body.name ?? '').trim();
    if (!name) errors.push('name requis');
    if (!CATEGORIES.includes(body.category)) errors.push(`category doit etre: ${CATEGORIES.join(', ')}`);
    const tempClass = body.temp_class ?? 'ambiant';
    if (!TEMP_CLASSES.includes(tempClass)) errors.push(`temp_class doit etre: ${TEMP_CLASSES.join(', ')}`);
    const ean = body.ean ? String(body.ean).trim() : null;
    if (ean && !/^(\d{8}|\d{13})$/.test(ean)) errors.push('ean doit avoir 8 ou 13 chiffres');
    const num = (k) => {
        const v = Number(body[k] ?? 0);
        if (!Number.isFinite(v) || v < 0) errors.push(`${k} doit etre un nombre >= 0`);
        return v;
    };
    const value = {
        name,
        category: body.category,
        unit: String(body.unit ?? 'unite').trim() || 'unite',
        ean,
        supplier: body.supplier ? String(body.supplier).trim() : null,
        buy_ht: num('buy_ht'),
        sell_ht: num('sell_ht'),
        allergens: String(body.allergens ?? '').trim(),
        temp_class: tempClass,
        favorite: body.favorite ? 1 : 0,
        min_stock: num('min_stock'),
    };
    return { errors, value };
}

const SELECT = 'SELECT p.*, a.name AS article FROM product p LEFT JOIN article a ON a.id = p.article_id';

const COLUMNS = ['name', 'category', 'unit', 'ean', 'supplier', 'buy_ht', 'sell_ht',
    'allergens', 'temp_class', 'favorite', 'min_stock', 'article_id'];

// Article name -> id, created on the fly. Blank = standalone product (null).
function articleId(db, name) {
    const n = String(name ?? '').trim();
    if (!n) return null;
    db.prepare('INSERT OR IGNORE INTO article (name) VALUES (?)').run(n);
    return db.prepare('SELECT id FROM article WHERE name = ?').get(n).id;
}

module.exports = (db) => {
    const wrap = (fn) => (req, res) => {
        try {
            fn(req, res);
        } catch (err) {
            if (/UNIQUE constraint failed: product\.ean/.test(err.message)) {
                return res.status(409).json({ error: 'Un produit avec cet EAN existe deja' });
            }
            if (/FOREIGN KEY constraint failed/.test(err.message)) {
                return res.status(409).json({ error: 'Produit utilise par des lots: suppression impossible' });
            }
            console.error(err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    };

    return {
        list: wrap((req, res) => {
            const { q, favorite, category } = req.query;
            const where = [];
            const params = [];
            if (q) {
                where.push('(p.name LIKE ? OR a.name LIKE ? OR p.ean = ?)');
                params.push(`%${q}%`, `%${q}%`, q);
            }
            if (favorite === '1') where.push('p.favorite = 1');
            if (category) {
                where.push('p.category = ?');
                params.push(category);
            }
            const sql = `${SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY p.name COLLATE NOCASE`;
            res.json(db.prepare(sql).all(...params));
        }),

        get: wrap((req, res) => {
            const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Produit introuvable' });
            res.json(row);
        }),

        byEan: wrap((req, res) => {
            const row = db.prepare(`${SELECT} WHERE p.ean = ?`).get(req.params.ean);
            if (!row) return res.status(404).json({ error: 'EAN inconnu' });
            res.json(row);
        }),

        create: wrap((req, res) => {
            const { errors, value } = validate(req.body);
            if (errors.length) return res.status(400).json({ errors });
            value.article_id = articleId(db, req.body.article);
            const info = db.prepare(
                `INSERT INTO product (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`
            ).run(...COLUMNS.map(c => value[c]));
            res.status(201).json(db.prepare(`${SELECT} WHERE p.id = ?`).get(info.lastInsertRowid));
        }),

        update: wrap((req, res) => {
            const { errors, value } = validate(req.body);
            if (errors.length) return res.status(400).json({ errors });
            // Callers that do not send `article` leave the product's article untouched.
            const withArticle = 'article' in req.body;
            const cols = withArticle ? COLUMNS : COLUMNS.filter(c => c !== 'article_id');
            if (withArticle) value.article_id = articleId(db, req.body.article);
            const info = db.prepare(
                `UPDATE product SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
            ).run(...cols.map(c => value[c]), req.params.id);
            if (!info.changes) return res.status(404).json({ error: 'Produit introuvable' });
            res.json(db.prepare(`${SELECT} WHERE p.id = ?`).get(req.params.id));
        }),

        // Hard delete is refused once stock/lots reference the product (added in stage 2).
        remove: wrap((req, res) => {
            const info = db.prepare('DELETE FROM product WHERE id = ?').run(req.params.id);
            if (!info.changes) return res.status(404).json({ error: 'Produit introuvable' });
            res.status(204).end();
        }),
    };
};
