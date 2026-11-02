const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');
const stock = require('../services/stock');
const haccp = require('../services/haccp');
const reports = require('../services/reports');

let db, app;
const day = (n) => stock.dayString(new Date(), n);
const today = day(0);

beforeEach(() => {
    db = openDb(':memory:');
    app = createApp(db);
});

const fridge = (body = {}) => request(app).post('/api/fridges').send({ name: 'Frigo 1', kind: 'preparations', ...body });

test('fridge threshold defaults come from the kind and can be overridden', async () => {
    expect((await fridge().expect(201)).body.max_temp).toBe(3);
    expect((await fridge({ name: 'Congel', kind: 'surgele' }).expect(201)).body.max_temp).toBe(-18);
    expect((await fridge({ name: 'Boissons', kind: 'perissable', max_temp: 6 }).expect(201)).body.max_temp).toBe(6);
    await fridge().expect(409);
    await fridge({ name: 'x', kind: 'inconnu' }).expect(400);
});

test('reading above the threshold raises an alert; at the threshold it does not', async () => {
    const f = (await fridge()).body;
    const read = (value) => request(app).post('/api/temperatures').send({ fridge_id: f.id, slot: 'matin', value }).expect(201);
    expect((await read(3)).body.alert).toBe(0);
    expect((await read(3.1)).body.alert).toBe(1);
    const c = (await fridge({ name: 'Congel', kind: 'surgele' })).body;
    const post = (value) => request(app).post('/api/temperatures').send({ fridge_id: c.id, slot: 'soir', value });
    expect((await post(-18)).body.alert).toBe(0);
    expect((await post(-15)).body.alert).toBe(1);
});

test('reading validation', async () => {
    const f = (await fridge()).body;
    await request(app).post('/api/temperatures').send({ fridge_id: f.id, slot: 'nuit', value: 2 }).expect(400);
    await request(app).post('/api/temperatures').send({ fridge_id: f.id, slot: 'matin', value: '' }).expect(400);
    await request(app).post('/api/temperatures').send({ fridge_id: 99, slot: 'matin', value: 2 }).expect(404);
});

test('todo lists missing readings and uncorrected alerts until an action is recorded', async () => {
    const f = (await fridge()).body;
    let t = (await request(app).get('/api/haccp/todo')).body;
    expect(t.missing_readings.map(m => m.slot)).toEqual(['matin', 'soir']);

    const r = (await request(app).post('/api/temperatures').send({ fridge_id: f.id, slot: 'matin', value: 6 })).body;
    t = (await request(app).get('/api/haccp/todo')).body;
    expect(t.missing_readings.map(m => m.slot)).toEqual(['soir']);
    expect(t.open_alerts.readings).toHaveLength(1);

    await request(app).put(`/api/temperatures/${r.id}/action`).send({ action: '' }).expect(400);
    await request(app).put(`/api/temperatures/${r.id}/action`).send({ action: 'Produits transferes, depannage appele' }).expect(204);
    t = (await request(app).get('/api/haccp/todo')).body;
    expect(t.open_alerts.readings).toHaveLength(0);
});

test('rapid cooling: ok within 2 h at 10 C, alert when too slow or too warm', async () => {
    const add = (end_at, end_temp) => request(app).post('/api/cooling')
        .send({ label: 'Sauce', start_at: '2026-11-02T10:00', start_temp: 63, end_at, end_temp });
    const ok = (await add('2026-11-02T11:59', 10).expect(201)).body;
    expect(ok).toMatchObject({ minutes: 119, alert: 0 });
    expect((await add('2026-11-02T12:00', 10)).body.alert).toBe(0); // exactly 2 h is allowed
    expect((await add('2026-11-02T12:01', 10)).body.alert).toBe(1);
    expect((await add('2026-11-02T11:00', 14)).body.alert).toBe(1);
    await add('2026-11-02T09:00', 10).expect(400);
    await request(app).post('/api/cooling').send({ start_at: '2026-11-02T10:00', start_temp: 63, end_at: '2026-11-02T11:00', end_temp: 9 }).expect(400);
});

test('cooling threshold follows the settings', async () => {
    await request(app).put('/api/settings').send({ cooling_max_minutes: 90 }).expect(200);
    const r = await request(app).post('/api/cooling')
        .send({ label: 'Sauce', start_at: '2026-11-02T10:00', start_temp: 63, end_at: '2026-11-02T11:45', end_temp: 9 });
    expect(r.body.alert).toBe(1);
});

test('cleaning: daily, weekly and monthly checks cover their whole period', async () => {
    const mk = (name, frequency) => request(app).post('/api/cleaning/tasks').send({ name, frequency }).then(r => r.body);
    const daily = await mk('Plans de travail', 'quotidien');
    const weekly = await mk('Frigos', 'hebdomadaire');
    const monthly = await mk('Hotte', 'mensuel');

    // 2026-11-04 is a Wednesday: its week runs 2026-11-02 .. 2026-11-08
    await request(app).put(`/api/cleaning/tasks/${weekly.id}/check`).send({ day: '2026-11-02' }).expect(204);
    await request(app).put(`/api/cleaning/tasks/${monthly.id}/check`).send({ day: '2026-11-30' }).expect(204);
    await request(app).put(`/api/cleaning/tasks/${daily.id}/check`).send({ day: '2026-11-03' }).expect(204);

    const status = async (d) => Object.fromEntries((await request(app).get(`/api/cleaning?day=${d}`)).body.map(t => [t.name, t.done]));
    expect(await status('2026-11-04')).toEqual({ 'Plans de travail': false, Frigos: true, Hotte: true });
    expect(await status('2026-11-03')).toMatchObject({ 'Plans de travail': true });
    expect((await status('2026-11-09')).Frigos).toBe(false);
    expect((await status('2026-12-01')).Hotte).toBe(false);

    await request(app).put(`/api/cleaning/tasks/${weekly.id}/check`).send({ day: '2026-11-02', done: false }).expect(204);
    expect((await status('2026-11-04')).Frigos).toBe(false);
});

test('week boundaries: Sunday belongs to the week that started on Monday', () => {
    expect(haccp.periodOf('hebdomadaire', '2026-11-08')).toEqual(['2026-11-02', '2026-11-08']);
    expect(haccp.periodOf('hebdomadaire', '2026-11-09')).toEqual(['2026-11-09', '2026-11-15']);
});

async function seedChain() {
    const mk = (b) => request(app).post('/api/products').send(b).then(r => r.body.id);
    const citron = await mk({ name: 'Citron', category: 'ingredient', temp_class: 'positif_8', supplier: 'Primeur Dupont', allergens: '' });
    const rec = await request(app).post('/api/receipts').send({ product_id: citron, qty: 10, dlc: day(5), lot_no: 'F-77', recv_temp: 4 });
    const recipe = (await request(app).post('/api/recipes').send({ name: 'Sirop', yield_qty: 2, items: [{ product_id: citron, qty: 4 }] })).body;
    const batch = (await request(app).post('/api/batches').send({ recipe_id: recipe.id, qty: 2 })).body.batch;
    await request(app).post('/api/sales').send({ lines: [{ product_id: recipe.output_product_id, qty: 1 }] });
    return { supplierLot: rec.body.lot.id, batch };
}

test('traceability links supplier lot -> preparation lot -> outputs, both ways', async () => {
    const { supplierLot, batch } = await seedChain();

    const down = (await request(app).get(`/api/lots/${supplierLot}/trace`).expect(200)).body.downstream;
    expect(down.used_in).toHaveLength(1);
    expect(down.used_in[0]).toMatchObject({ batch_id: batch.id, qty_used: 4 });
    expect(down.used_in[0].output.movements).toEqual([{ reason: 'sale', qty: 1, n: 1 }]);

    const up = (await request(app).get(`/api/lots/${batch.lot_id}/trace`).expect(200)).body.upstream;
    expect(up.batch.name).toBe('Sirop');
    expect(up.sources[0]).toMatchObject({ lot_no: 'F-77', supplier: 'Primeur Dupont', qty_used: 4, recv_temp: 4 });
    await request(app).get('/api/lots/9999/trace').expect(404);
});

test('PDF exports are valid PDFs', async () => {
    const { supplierLot, batch } = await seedChain();
    const f = (await fridge()).body;
    await request(app).post('/api/temperatures').send({ fridge_id: f.id, slot: 'matin', value: 5 });
    await request(app).post('/api/cooling').send({ label: 'Sauce', start_at: `${today}T10:00`, start_temp: 63, end_at: `${today}T13:00`, end_temp: 9 });

    for (const url of [
        `/api/haccp/report.pdf?from=${today}&to=${today}`,
        `/api/batches/${batch.id}/trace.pdf`,
        `/api/lots/${supplierLot}/trace.pdf`,
    ]) {
        const r = await request(app).get(url).buffer(true).parse((res, cb) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
        }).expect(200);
        expect(r.headers['content-type']).toMatch(/pdf/);
        expect(r.body.slice(0, 4).toString()).toBe('%PDF');
    }
    await request(app).get('/api/haccp/report.pdf?from=2026-12-01&to=2026-11-01').expect(400);
});

test('report PDF handles many rows across pages', async () => {
    const f = (await fridge()).body;
    for (let i = 0; i < 120; i++) {
        haccp.addReading(db, { fridge_id: f.id, slot: i % 2 ? 'soir' : 'matin', value: 2, day: day(-Math.floor(i / 2)) });
    }
    const buf = await reports.registerPdf(db, { from: day(-100), to: today });
    expect((buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
});
