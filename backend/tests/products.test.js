const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');

let app;
beforeEach(() => {
    app = createApp(openDb(':memory:'));
});

const base = { name: 'Coca 33cl', category: 'boisson', unit: 'canette', ean: '5449000000996', buy_ht: 0.6, sell_ht: 2.5 };

test('create then fetch by id and by EAN', async () => {
    const created = await request(app).post('/api/products').send(base).expect(201);
    expect(created.body.id).toBeGreaterThan(0);
    await request(app).get(`/api/products/${created.body.id}`).expect(200);
    const byEan = await request(app).get('/api/products/ean/5449000000996').expect(200);
    expect(byEan.body.name).toBe('Coca 33cl');
});

test('rejects invalid category, bad EAN and negative price', async () => {
    const res = await request(app).post('/api/products')
        .send({ ...base, category: 'x', ean: '123', buy_ht: -1 }).expect(400);
    expect(res.body.errors).toHaveLength(3);
});

test('duplicate EAN returns 409', async () => {
    await request(app).post('/api/products').send(base).expect(201);
    await request(app).post('/api/products').send({ ...base, name: 'Autre' }).expect(409);
});

test('unknown EAN returns 404', async () => {
    await request(app).get('/api/products/ean/12345670').expect(404);
});

test('search and favorites filters', async () => {
    await request(app).post('/api/products').send({ ...base, favorite: true }).expect(201);
    await request(app).post('/api/products').send({ name: 'Citron', category: 'ingredient', temp_class: 'positif_8' }).expect(201);
    expect((await request(app).get('/api/products?q=cit')).body).toHaveLength(1);
    expect((await request(app).get('/api/products?favorite=1')).body).toHaveLength(1);
    expect((await request(app).get('/api/products')).body).toHaveLength(2);
});

test('update and delete', async () => {
    const { body } = await request(app).post('/api/products').send(base).expect(201);
    const up = await request(app).put(`/api/products/${body.id}`).send({ ...base, sell_ht: 3 }).expect(200);
    expect(up.body.sell_ht).toBe(3);
    await request(app).delete(`/api/products/${body.id}`).expect(204);
    await request(app).get(`/api/products/${body.id}`).expect(404);
});
