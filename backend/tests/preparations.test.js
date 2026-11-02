const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');
const stock = require('../services/stock');
const batches = require('../services/batches');

let db, app, printed, citron, sucre, recipe;
const day = (n) => stock.dayString(new Date(), n);

beforeEach(async () => {
    db = openDb(':memory:');
    printed = [];
    app = createApp(db, { printDriver: async (printer, lines) => { printed.push({ printer, lines }); } });
    const mk = (b) => request(app).post('/api/products').send(b).then(r => r.body.id);
    citron = await mk({ name: 'Citron', category: 'ingredient', temp_class: 'positif_8', allergens: '' });
    sucre = await mk({ name: 'Sucre', category: 'ingredient', allergens: 'sulfites' });
    await request(app).post('/api/receipts').send({ product_id: citron, qty: 10, dlc: day(5), lot_no: 'C1' });
    await request(app).post('/api/receipts').send({ product_id: sucre, qty: 10, lot_no: 'S1' });
    recipe = (await request(app).post('/api/recipes').send({
        name: 'Sirop citron', yield_qty: 2, unit: 'L',
        items: [{ product_id: citron, qty: 4 }, { product_id: sucre, qty: 1 }],
    }).expect(201)).body;
});

const make = (body = {}) => request(app).post('/api/batches').send({ recipe_id: recipe.id, ...body });

test('recipe auto-creates its output product', () => {
    expect(recipe.output_product_id).toBeGreaterThan(0);
    expect(recipe.items).toHaveLength(2);
});

test('batch deducts ingredients (scaled), records sources, stocks the output with a +3 day DLC', async () => {
    const { body } = await make({ qty: 4 }).expect(201);
    const b = body.batch;
    expect(b.dlc).toBe(day(3));
    expect(b.lot_no).toMatch(/^P\d{8}-\d+$/);
    expect(b.sources.map(s => [s.product_name, s.qty]).sort()).toEqual([['Citron', 8], ['Sucre', 2]]);
    const s = (await request(app).get('/api/stock')).body;
    expect(s.find(x => x.product_id === citron).qty).toBe(2);
    expect(s.find(x => x.product_id === recipe.output_product_id).qty).toBe(4);
});

test('batch with insufficient ingredients is rolled back entirely', async () => {
    await make({ qty: 10 }).expect(409); // needs 20 citrons
    expect((await request(app).get('/api/batches')).body).toHaveLength(0);
    const s = (await request(app).get('/api/stock')).body;
    expect(s.find(x => x.product_id === citron).qty).toBe(10);
    expect(s.find(x => x.product_id === sucre).qty).toBe(10);
});

test('DLC beyond 3 days needs a justification, past DLC refused', async () => {
    await make({ dlc: day(5) }).expect(400);
    const ok = await make({ dlc: day(5), justification: 'Etude de duree de vie du 12/10' }).expect(201);
    expect(ok.body.batch.justification).toMatch(/Etude/);
    await make({ dlc: day(-1) }).expect(400);
});

test('freeze then thaw recalculates the DLC; refreezing is forbidden', async () => {
    const id = (await make().expect(201)).body.batch.id;
    const frozen = (await request(app).post(`/api/batches/${id}/freeze`).expect(200)).body;
    expect(frozen.state).toBe('frozen');
    expect(frozen.current_dlc).toBeNull();
    await request(app).post(`/api/batches/${id}/freeze`).expect(409);
    const thawed = (await request(app).post(`/api/batches/${id}/thaw`).expect(200)).body;
    expect(thawed.state).toBe('thawed');
    expect(thawed.current_dlc).toBe(stock.dayString(new Date(Date.now() + 24 * 3600 * 1000)));
    await request(app).post(`/api/batches/${id}/freeze`).expect(409);
    await request(app).post(`/api/batches/${id}/thaw`).expect(409);
});

test('freezing is blocked after the DLC', () => {
    const id = batches.createBatch(db, { recipe_id: recipe.id }).id;
    const later = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    expect(() => batches.freeze(db, id, { now: later })).toThrow(/apres la DLC/);
});

test('thaw DLC follows the setting, capped at 48 h', async () => {
    await request(app).put('/api/settings').send({ thaw_dlc_hours: 49 }).expect(400);
    await request(app).put('/api/settings').send({ thaw_dlc_hours: 48 }).expect(200);
    const id = (await make().expect(201)).body.batch.id;
    await request(app).post(`/api/batches/${id}/freeze`);
    const t = (await request(app).post(`/api/batches/${id}/thaw`)).body;
    expect(t.current_dlc).toBe(stock.dayString(new Date(Date.now() + 48 * 3600 * 1000)));
});

test('label has the mandatory fields and the PDF is served', async () => {
    const id = (await make().expect(201)).body.batch.id;
    await request(app).put('/api/settings').send({ printer: 'Etiqueteuse' });
    await request(app).post(`/api/batches/${id}/print`).expect(200);
    const text = printed[0].lines.map(l => l.text).join('\n');
    expect(text).toMatch(/Sirop citron/);
    expect(text).toMatch(/Fabrique le/);
    expect(text).toMatch(/DLC/);
    expect(text).toMatch(/Lot : P/);
    expect(text).toMatch(/sulfites/);
    const pdf = await request(app).get(`/api/batches/${id}/label.pdf`).expect(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
});

test('print needs a printer; failure at creation does not undo the batch', async () => {
    const r = await make({ print: true }).expect(201);
    expect(r.body.print_error).toMatch(/imprimante/i);
    expect(r.body.batch.id).toBeGreaterThan(0);
    await request(app).put('/api/settings').send({ printer: 'X' });
    const r2 = await make({ print: true }).expect(201);
    expect(r2.body.print.printed).toBe(true);
    expect(printed).toHaveLength(1);
});

test('recipe used by a batch cannot be deleted', async () => {
    await make().expect(201);
    await request(app).delete(`/api/recipes/${recipe.id}`).expect(409);
});
