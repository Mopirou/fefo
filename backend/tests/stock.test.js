const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');
const stock = require('../services/stock');

let db, app, pid;
beforeEach(async () => {
    db = openDb(':memory:');
    app = createApp(db);
    const r = await request(app).post('/api/products').send({ name: 'Lait', category: 'ingredient', temp_class: 'positif_4', min_stock: 5 });
    pid = r.body.id;
});

const day = (offset) => stock.dayString(new Date(), offset);
const recv = (body) => request(app).post('/api/receipts').send({ product_id: pid, ...body });

test('receipt creates a lot and stock', async () => {
    await recv({ qty: 10, dlc: day(5), lot_no: 'A1' }).expect(201);
    const s = (await request(app).get('/api/stock')).body.find(x => x.product_id === pid);
    expect(s.qty).toBe(10);
    expect(s.next_dlc).toBe(day(5));
});

test('cold product needs a DLC, bad date and qty rejected', async () => {
    await recv({ qty: 1 }).expect(400);
    await recv({ qty: 1, dlc: '05/01/2027' }).expect(400);
    await recv({ qty: 0, dlc: day(2) }).expect(400);
});

test('warns when reception temperature is too high', async () => {
    const r = await recv({ qty: 1, dlc: day(3), recv_temp: 7 }).expect(201);
    expect(r.body.warnings).toHaveLength(1);
});

test('FEFO consumes the earliest DLC first across lots', async () => {
    await recv({ qty: 4, dlc: day(10), lot_no: 'late' });
    await recv({ qty: 3, dlc: day(2), lot_no: 'early' });
    const r = await request(app).post('/api/stock/consume').send({ product_id: pid, qty: 5, reason: 'sale' }).expect(200);
    expect(r.body.map(t => [t.lot_no, t.qty])).toEqual([['early', 3], ['late', 2]]);
    const s = (await request(app).get('/api/stock')).body.find(x => x.product_id === pid);
    expect(s.qty).toBe(2);
});

test('consume is all-or-nothing and skips expired and non-conform lots', async () => {
    await recv({ qty: 5, dlc: day(-1), lot_no: 'expired' });
    await recv({ qty: 5, dlc: day(3), conform: false, lot_no: 'refused' });
    await recv({ qty: 2, dlc: day(3), lot_no: 'ok' });
    await request(app).post('/api/stock/consume').send({ product_id: pid, qty: 3 }).expect(409);
    const ok = await request(app).post('/api/stock/consume').send({ product_id: pid, qty: 2 }).expect(200);
    expect(ok.body[0].lot_no).toBe('ok');
});

test('alerts: low stock, DLC tomorrow, today, expired', async () => {
    await recv({ qty: 1, dlc: day(-1), lot_no: 'exp' });
    await recv({ qty: 1, dlc: day(0), lot_no: 'today' });
    await recv({ qty: 1, dlc: day(1), lot_no: 'tmrw' });
    const a = (await request(app).get('/api/alerts')).body;
    expect(a.dlc_expired.map(l => l.lot_no)).toEqual(['exp']);
    expect(a.dlc_today.map(l => l.lot_no)).toEqual(['today']);
    expect(a.dlc_tomorrow.map(l => l.lot_no)).toEqual(['tmrw']);
    expect(a.low_stock.map(s => s.product_id)).toEqual([pid]);
});

test('inventory removes shortfall FEFO-style and logs the gap', async () => {
    await recv({ qty: 4, dlc: day(2), lot_no: 'a' });
    await recv({ qty: 4, dlc: day(6), lot_no: 'b' });
    const r = await request(app).post('/api/inventory').send({ counts: [{ product_id: pid, counted: 5 }] }).expect(200);
    expect(r.body[0]).toMatchObject({ theoretical: 8, counted: 5, gap: -3 });
    const lots = (await request(app).get(`/api/stock/lots?product_id=${pid}`)).body;
    expect(lots.map(l => [l.lot_no, l.qty])).toEqual([['a', 1], ['b', 4]]);
});

test('inventory surplus creates an inventory lot', async () => {
    const r = await request(app).post('/api/inventory').send({ counts: [{ product_id: pid, counted: 3 }] }).expect(200);
    expect(r.body[0].gap).toBe(3);
    expect((await request(app).get('/api/stock')).body.find(x => x.product_id === pid).qty).toBe(3);
});

test('a product with lots cannot be deleted', async () => {
    await recv({ qty: 1, dlc: day(2) });
    await request(app).delete(`/api/products/${pid}`).expect(409);
});
