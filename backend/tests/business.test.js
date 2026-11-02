const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');
const stock = require('../services/stock');

let db, app, cola, citron;
const day = (n) => stock.dayString(new Date(), n);
const today = day(0);

beforeEach(async () => {
    db = openDb(':memory:');
    app = createApp(db);
    const mk = (b) => request(app).post('/api/products').send(b).then(r => r.body.id);
    cola = await mk({ name: 'Cola', category: 'boisson', ean: '5449000000996', buy_ht: 0.6, sell_ht: 2.5 });
    citron = await mk({ name: 'Citron', category: 'ingredient', temp_class: 'positif_8', buy_ht: 0.2, sell_ht: 0 });
    await request(app).post('/api/receipts').send({ product_id: cola, qty: 20, dlc: day(60), lot_no: 'L1' });
});

const stockOf = async (id) => (await request(app).get('/api/stock')).body.find(s => s.product_id === id).qty;

test('sale takes stock FEFO and snapshots price and cost', async () => {
    const r = await request(app).post('/api/sales').send({ lines: [{ product_id: cola, qty: 5 }] }).expect(201);
    expect(r.body.sales[0]).toMatchObject({ unit_price_ht: 2.5, unit_cost_ht: 0.6, stock_shortfall: 0 });
    expect(await stockOf(cola)).toBe(15);
});

test('sale beyond stock is recorded with a shortfall instead of failing', async () => {
    const r = await request(app).post('/api/sales').send({ lines: [{ product_id: cola, qty: 25 }] }).expect(201);
    expect(r.body.shortfalls).toEqual([{ product_id: cola, name: 'Cola', shortfall: 5 }]);
    expect(await stockOf(cola)).toBe(0);
});

test('sale validation', async () => {
    await request(app).post('/api/sales').send({ lines: [] }).expect(400);
    await request(app).post('/api/sales').send({ lines: [{ product_id: cola, qty: 0 }] }).expect(400);
    await request(app).post('/api/sales').send({ lines: [{ product_id: 999, qty: 1 }] }).expect(404);
});

test('loss takes FEFO including expired lots and records the cost', async () => {
    await request(app).post('/api/receipts').send({ product_id: citron, qty: 10, dlc: day(-2), lot_no: 'old' });
    const r = await request(app).post('/api/losses').send({ product_id: citron, qty: 4, reason: 'dlc_depassee' }).expect(201);
    expect(r.body.cost_ht).toBeCloseTo(0.8);
    expect(await stockOf(citron)).toBe(6); // expired stock still counts until it is declared lost
    const lots = (await request(app).get(`/api/stock/lots?product_id=${citron}`)).body;
    expect(lots[0].qty).toBe(6);
});

test('loss on a refused lot, reason and quantity validated', async () => {
    const rec = await request(app).post('/api/receipts').send({ product_id: cola, qty: 3, dlc: day(10), conform: false });
    const lotId = rec.body.lot.id;
    await request(app).post('/api/losses').send({ product_id: cola, qty: 5, reason: 'casse', lot_id: lotId }).expect(409);
    await request(app).post('/api/losses').send({ product_id: cola, qty: 3, reason: 'casse', lot_id: lotId }).expect(201);
    await request(app).post('/api/losses').send({ product_id: cola, qty: 1, reason: 'vol' }).expect(400);
    expect(await stockOf(cola)).toBe(20);
});

test('CSV import: semicolons, decimal commas, dd/mm/yyyy, EAN or name', async () => {
    const csv = 'Date;Produit;Quantite;Prix\n02/11/2026;5449000000996;3;2,80\n02/11/2026;Cola;2;\n';
    const r = await request(app).post('/api/sales/import').send({ csv }).expect(201);
    expect(r.body.imported).toBe(2);
    const sales = (await request(app).get('/api/sales')).body;
    expect(sales.map(s => [s.day, s.qty, s.unit_price_ht]).sort()).toEqual([['2026-11-02', 2, 2.5], ['2026-11-02', 3, 2.8]]);
    expect(await stockOf(cola)).toBe(15);
});

test('CSV import is all or nothing and reports bad lines', async () => {
    const csv = 'produit,quantite\nCola,2\nInconnu,1\nCola,abc\n';
    const r = await request(app).post('/api/sales/import').send({ csv, date: today }).expect(422);
    expect(r.body.errors.map(e => e.line)).toEqual([3, 4]);
    expect((await request(app).get('/api/sales')).body).toHaveLength(0);
    expect(await stockOf(cola)).toBe(20);
});

test('CSV import with custom column mapping', async () => {
    const csv = 'Article POS;Nb\nCola;4\n';
    await request(app).post('/api/sales/import')
        .send({ csv, date: today, mapping: { product: 'Article POS', qty: 'Nb' } }).expect(201);
    expect(await stockOf(cola)).toBe(16);
});

test('dashboard: revenue, margin, losses, profit, stock value, recipe cost', async () => {
    await request(app).post('/api/sales').send({ lines: [{ product_id: cola, qty: 10 }] }); // 25.00 revenue, 6.00 cost
    await request(app).post('/api/losses').send({ product_id: cola, qty: 2, reason: 'casse' }); // 1.20
    await request(app).post('/api/receipts').send({ product_id: citron, qty: 10, dlc: day(5) });
    await request(app).post('/api/recipes').send({ name: 'Citronnade', yield_qty: 2, items: [{ product_id: citron, qty: 5 }] });
    const d = (await request(app).get(`/api/dashboard?from=${today}&to=${today}`).expect(200)).body;
    expect(d.revenue).toBe(25);
    expect(d.cogs).toBe(6);
    expect(d.gross_margin).toBe(19);
    expect(d.gross_margin_pct).toBe(76);
    expect(d.losses_total).toBe(1.2);
    expect(d.losses_pct_of_revenue).toBe(4.8);
    expect(d.profit).toBe(17.8);
    expect(d.stock_value).toBe(6.8); // 8 cola * 0.6 + 10 citrons * 0.2
    expect(d.recipes[0]).toMatchObject({ name: 'Citronnade', unit_cost: 0.5 });
    expect(d.drinks[0]).toMatchObject({ name: 'Cola', margin: 1.9 });
    await request(app).get('/api/dashboard?from=2026-12-01&to=2026-11-01').expect(400);
});
