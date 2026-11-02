const { httpError, tx } = require('../utils/http');

function validate(db, body) {
    const name = String(body.name ?? '').trim();
    if (!name) throw httpError(400, 'name requis');
    const yieldQty = Number(body.yield_qty);
    if (!Number.isFinite(yieldQty) || yieldQty <= 0) throw httpError(400, 'yield_qty doit etre > 0');
    const days = body.default_dlc_days === undefined ? 3 : Number(body.default_dlc_days);
    if (!Number.isInteger(days) || days < 0) throw httpError(400, 'default_dlc_days invalide');
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw httpError(400, 'au moins un ingredient requis');
    const seen = new Set();
    for (const it of items) {
        const q = Number(it.qty);
        if (!Number.isFinite(q) || q <= 0) throw httpError(400, 'quantite d\'ingredient invalide');
        if (seen.has(it.product_id)) throw httpError(400, 'ingredient en double');
        seen.add(it.product_id);
        if (!db.prepare('SELECT 1 FROM product WHERE id = ?').get(it.product_id)) throw httpError(404, `Ingredient ${it.product_id} introuvable`);
    }
    return { name, yieldQty, days, items };
}

function getRecipe(db, id) {
    const recipe = db.prepare('SELECT * FROM recipe WHERE id = ?').get(id);
    if (!recipe) throw httpError(404, 'Recette introuvable');
    recipe.items = db.prepare(
        `SELECT ri.product_id, ri.qty, p.name, p.unit, p.buy_ht
         FROM recipe_item ri JOIN product p ON p.id = ri.product_id WHERE ri.recipe_id = ? ORDER BY p.name`
    ).all(id);
    return recipe;
}

function listRecipes(db) {
    return db.prepare('SELECT id, name, yield_qty, default_dlc_days, output_product_id FROM recipe ORDER BY name COLLATE NOCASE').all();
}

// The prepared item is itself a product (so it can be stocked, sold, counted).
// Without output_product_id, one is created and named after the recipe.
function saveRecipe(db, body, id = null) {
    const { name, yieldQty, days, items } = validate(db, body);
    return tx(db, () => {
        let outputId = body.output_product_id;
        if (outputId && !db.prepare('SELECT 1 FROM product WHERE id = ?').get(outputId)) {
            throw httpError(404, 'Produit de sortie introuvable');
        }
        if (id === null) {
            if (!outputId) {
                outputId = db.prepare(
                    `INSERT INTO product (name, category, unit, temp_class) VALUES (?, 'ingredient', ?, 'positif_3')`
                ).run(name, String(body.unit || 'portion')).lastInsertRowid;
            }
            id = db.prepare(
                'INSERT INTO recipe (name, output_product_id, yield_qty, default_dlc_days) VALUES (?, ?, ?, ?)'
            ).run(name, outputId, yieldQty, days).lastInsertRowid;
        } else {
            getRecipe(db, id);
            db.prepare('UPDATE recipe SET name = ?, yield_qty = ?, default_dlc_days = ? WHERE id = ?').run(name, yieldQty, days, id);
            db.prepare('DELETE FROM recipe_item WHERE recipe_id = ?').run(id);
        }
        const ins = db.prepare('INSERT INTO recipe_item (recipe_id, product_id, qty) VALUES (?, ?, ?)');
        for (const it of items) ins.run(id, it.product_id, Number(it.qty));
        return getRecipe(db, Number(id));
    });
}

function deleteRecipe(db, id) {
    getRecipe(db, id);
    if (db.prepare('SELECT 1 FROM prep_batch WHERE recipe_id = ?').get(id)) {
        throw httpError(409, 'Recette utilisee par des lots fabriques: suppression impossible');
    }
    db.prepare('DELETE FROM recipe WHERE id = ?').run(id);
}

module.exports = { getRecipe, listRecipes, saveRecipe, deleteRecipe };
