const { httpError } = require('../utils/http');
const { dayString } = require('./stock');
const { productUnitCost, recipeUnitCost } = require('./costs');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round = (n) => Math.round(n * 100) / 100;

function period({ from, to }, now = new Date()) {
    // default: current month
    const start = from || dayString(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = to || dayString(now);
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) throw httpError(400, 'periode invalide');
    return { from: start, to: end };
}

function dashboard(db, query = {}, now = new Date()) {
    const { from, to } = period(query, now);

    // Stock valued at cost: conform lots still holding stock.
    const lots = db.prepare(
        `SELECT l.product_id, COALESCE(SUM(m.delta), 0) AS qty FROM lot l
         LEFT JOIN stock_move m ON m.lot_id = l.id WHERE l.conform = 1 GROUP BY l.id HAVING qty > 0`
    ).all();
    const stockValue = lots.reduce((s, l) => s + l.qty * productUnitCost(db, l.product_id), 0);

    const sales = db.prepare(
        `SELECT COALESCE(SUM(qty * unit_price_ht), 0) AS revenue, COALESCE(SUM(qty * unit_cost_ht), 0) AS cogs
         FROM sale WHERE day >= ? AND day <= ?`
    ).get(from, to);
    const losses = db.prepare(
        `SELECT reason, SUM(cost_ht) AS cost, SUM(qty) AS qty FROM loss WHERE day >= ? AND day <= ? GROUP BY reason`
    ).all(from, to);
    const lossTotal = losses.reduce((s, l) => s + l.cost, 0);
    const grossMargin = sales.revenue - sales.cogs;

    const recipes = db.prepare(
        `SELECT r.id, r.name, p.sell_ht FROM recipe r JOIN product p ON p.id = r.output_product_id ORDER BY r.name COLLATE NOCASE`
    ).all().map(r => {
        const cost = recipeUnitCost(db, r.id);
        return { recipe_id: r.id, name: r.name, unit_cost: round(cost), sell_ht: r.sell_ht, margin: round(r.sell_ht - cost),
            margin_pct: r.sell_ht > 0 ? round((r.sell_ht - cost) / r.sell_ht * 100) : null };
    });
    const drinks = db.prepare(
        `SELECT id, name, buy_ht, sell_ht FROM product WHERE category = 'boisson' ORDER BY name COLLATE NOCASE`
    ).all().map(d => ({ product_id: d.id, name: d.name, unit_cost: d.buy_ht, sell_ht: d.sell_ht, margin: round(d.sell_ht - d.buy_ht),
        margin_pct: d.sell_ht > 0 ? round((d.sell_ht - d.buy_ht) / d.sell_ht * 100) : null }));

    return {
        from, to,
        stock_value: round(stockValue),
        revenue: round(sales.revenue),
        cogs: round(sales.cogs),
        gross_margin: round(grossMargin),
        gross_margin_pct: sales.revenue > 0 ? round(grossMargin / sales.revenue * 100) : null,
        losses_total: round(lossTotal),
        losses_pct_of_revenue: sales.revenue > 0 ? round(lossTotal / sales.revenue * 100) : null,
        profit: round(grossMargin - lossTotal), // gross margin after losses
        losses_by_reason: losses.map(l => ({ reason: l.reason, cost: round(l.cost), qty: l.qty })),
        recipes,
        drinks,
    };
}

module.exports = { dashboard };
