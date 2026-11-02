// Cost of one unit of a product: its purchase price, or for a prepared product
// (output of a recipe) the cost of the ingredients divided by the recipe yield.
const MAX_DEPTH = 5; // guards against a recipe that (indirectly) uses its own output

function productUnitCost(db, productId, depth = 0) {
    const recipe = db.prepare('SELECT id FROM recipe WHERE output_product_id = ?').get(productId);
    if (recipe && depth < MAX_DEPTH) return recipeUnitCost(db, recipe.id, depth);
    const p = db.prepare('SELECT buy_ht FROM product WHERE id = ?').get(productId);
    return p ? p.buy_ht : 0;
}

function recipeUnitCost(db, recipeId, depth = 0) {
    const recipe = db.prepare('SELECT yield_qty FROM recipe WHERE id = ?').get(recipeId);
    const items = db.prepare('SELECT product_id, qty FROM recipe_item WHERE recipe_id = ?').all(recipeId);
    const total = items.reduce((s, it) => s + it.qty * productUnitCost(db, it.product_id, depth + 1), 0);
    return total / recipe.yield_qty;
}

module.exports = { productUnitCost, recipeUnitCost };
