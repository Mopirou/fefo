const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { openDb } = require('../config/db');
const { createApp } = require('../app');
const auth = require('../services/auth');
const backup = require('../services/backup');
const exporter = require('../services/exporter');
const settings = require('../services/settings');

let db, app, tmp;
beforeEach(() => {
    db = openDb(':memory:');
    app = createApp(db);
    auth.clearFailures();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haccp-test-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const product = { name: 'Cola', category: 'boisson' };

describe('PIN accounts', () => {
    test('open until the first user exists; creating it signs them in and locks the API', async () => {
        const agent = request.agent(app);
        await agent.post('/api/products').send(product).expect(201); // open mode
        const st = (await agent.get('/api/auth/status')).body;
        expect(st).toMatchObject({ auth_required: false, user: null });

        await agent.post('/api/users').send({ name: 'Nathan', pin: '1234' }).expect(201);
        expect((await agent.get('/api/auth/status')).body).toMatchObject({ auth_required: true, user: { name: 'Nathan' } });
        await agent.get('/api/products').expect(200); // still logged in
        await request(app).get('/api/products').expect(401); // anonymous client is locked out
    });

    test('login with the right PIN, wrong PIN rejected, PIN never stored in clear', async () => {
        auth.createUser(db, { name: 'Lea', pin: '4321' });
        const lea = auth.listUsers(db)[0];
        await request(app).post('/api/auth/login').send({ user_id: lea.id, pin: '0000' }).expect(401);
        const agent = request.agent(app);
        const r = await agent.post('/api/auth/login').send({ user_id: lea.id, pin: '4321' }).expect(200);
        expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly; SameSite=Strict/);
        await agent.get('/api/products').expect(200);
        const row = db.prepare('SELECT * FROM app_user').get();
        expect(JSON.stringify(row)).not.toContain('4321');
        expect(JSON.stringify(db.prepare('SELECT * FROM session').all())).not.toContain(r.headers['set-cookie'][0].split(';')[0].split('=')[1]);
    });

    test('five wrong PINs lock the account for a minute', async () => {
        auth.createUser(db, { name: 'Lea', pin: '4321' });
        const id = auth.listUsers(db)[0].id;
        for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ user_id: id, pin: '1111' }).expect(401);
        await request(app).post('/api/auth/login').send({ user_id: id, pin: '4321' }).expect(429);
    });

    test('logout ends the session', async () => {
        auth.createUser(db, { name: 'Lea', pin: '4321' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ user_id: auth.listUsers(db)[0].id, pin: '4321' });
        await agent.post('/api/auth/logout').expect(204);
        await agent.get('/api/products').expect(401);
    });

    test('PIN format, duplicate names, last active user cannot be disabled', async () => {
        expect(() => auth.createUser(db, { name: 'A', pin: '12' })).toThrow(/PIN/);
        auth.createUser(db, { name: 'A', pin: '1234' });
        expect(() => auth.createUser(db, { name: 'a', pin: '1234' })).toThrow(/existe/);
        const a = auth.listUsers(db)[0];
        expect(() => auth.updateUser(db, a.id, { active: false })).toThrow(/dernier/);
        const b = auth.createUser(db, { name: 'B', pin: '5678' });
        auth.updateUser(db, a.id, { active: false });
        expect(() => auth.login(db, a.id, '1234')).toThrow(/incorrect/);
        auth.updateUser(db, b.id, { pin: '9999' });
        expect(auth.login(db, b.id, '9999').user.name).toBe('B');
    });

    test('actions are attributed to the logged-in user (who entered what)', async () => {
        const agent = request.agent(app);
        await agent.post('/api/users').send({ name: 'Nathan', pin: '1234' });
        const p = (await agent.post('/api/products').send(product)).body;
        await agent.post('/api/receipts').send({ product_id: p.id, qty: 5, dlc: '2099-01-01' });
        await agent.post('/api/sales').send({ lines: [{ product_id: p.id, qty: 2 }] });
        const fr = (await agent.post('/api/fridges').send({ name: 'F', kind: 'preparations' })).body;
        await agent.post('/api/temperatures').send({ fridge_id: fr.id, slot: 'matin', value: 2 });

        const who = (sql) => db.prepare(sql).all().map(r => r.name);
        expect(who('SELECT u.name FROM lot l JOIN app_user u ON u.id = l.user_id')).toEqual(['Nathan']);
        expect(who('SELECT u.name FROM stock_move m JOIN app_user u ON u.id = m.user_id')).toEqual(['Nathan', 'Nathan']);
        expect((await agent.get('/api/sales')).body[0].user_name).toBe('Nathan');
        expect((await agent.get('/api/temperatures')).body[0].user_name).toBe('Nathan');
    });

    test('actions in open mode have no author', async () => {
        const p = (await request(app).post('/api/products').send(product)).body;
        await request(app).post('/api/receipts').send({ product_id: p.id, qty: 5, dlc: '2099-01-01' });
        expect(db.prepare('SELECT user_id FROM lot').get().user_id).toBeNull();
    });
});

describe('backup', () => {
    const at = (d) => new Date(2026, 10, d, 8, 30, 0);

    test('creates a restorable copy of the database', () => {
        db.prepare("INSERT INTO product (name, category) VALUES ('Cola', 'boisson')").run();
        settings.updateSettings(db, { backup_dir: tmp });
        const { file } = backup.runBackup(db, { now: at(2) });
        expect(path.basename(file)).toBe('haccp-20261102-083000.db');
        const { DatabaseSync } = require('node:sqlite');
        const copy = new DatabaseSync(file);
        expect(copy.prepare('SELECT name FROM product').get().name).toBe('Cola');
        copy.close();
    });

    test('keeps only the 30 newest versions', () => {
        settings.updateSettings(db, { backup_dir: tmp });
        for (let d = 1; d <= 28; d++) backup.runBackup(db, { now: new Date(2026, 9, d, 8, 0, 0) });
        for (let d = 1; d <= 5; d++) backup.runBackup(db, { now: new Date(2026, 10, d, 8, 0, 0) });
        const files = fs.readdirSync(tmp).sort();
        expect(files).toHaveLength(30);
        expect(files[0]).toBe('haccp-20261004-080000.db'); // the 3 oldest were pruned
        expect(files.at(-1)).toBe('haccp-20261105-080000.db');
    });

    test('one backup a day, stale detection, unreachable folder reported', () => {
        settings.updateSettings(db, { backup_dir: tmp });
        expect(backup.hasBackupToday(db, at(2))).toBe(false);
        backup.runBackup(db, { now: at(2) });
        expect(backup.hasBackupToday(db, at(2))).toBe(true);
        expect(backup.status(db, at(3)).stale).toBe(false);
        expect(backup.status(db, at(4)).stale).toBe(true);

        const blocker = path.join(tmp, 'a-file');
        fs.writeFileSync(blocker, 'x');
        settings.updateSettings(db, { backup_dir: path.join(blocker, 'sub') });
        expect(() => backup.runBackup(db)).toThrow();
        expect(backup.status(db).last_error).toBeTruthy();
    });

    test('API: run and status', async () => {
        settings.updateSettings(db, { backup_dir: tmp });
        await request(app).post('/api/backup/run').expect(201);
        const st = (await request(app).get('/api/backup/status')).body;
        expect(st).toMatchObject({ count: 1, stale: false, last_error: null });
    });
});

describe('CSV export', () => {
    test('semicolon CSV with BOM, quoting, and no secrets', async () => {
        db.prepare("INSERT INTO product (name, category, allergens) VALUES ('Sirop; \"maison\"', 'boisson', 'gluten')").run();
        const csv = exporter.tableCsv(db, 'product');
        expect(csv.startsWith('﻿id;name;category')).toBe(true);
        expect(csv).toContain('"Sirop; ""maison"""');
        auth.createUser(db, { name: 'Lea', pin: '4321' });
        const users = exporter.tableCsv(db, 'app_user');
        expect(users).not.toMatch(/pin_hash|pin_salt/);
        expect(() => exporter.tableCsv(db, 'session')).toThrow(/inconnue/);
        expect(() => exporter.tableCsv(db, 'sqlite_master')).toThrow(/inconnue/);
    });

    test('empty tables still export their header; HTTP download', async () => {
        const r = await request(app).get('/api/export/loss.csv').expect(200);
        expect(r.headers['content-disposition']).toMatch(/loss\.csv/);
        expect(r.text).toMatch(/^﻿id;product_id;lot_id;day;qty;reason/);
        const tables = (await request(app).get('/api/export')).body;
        expect(tables).toContain('sale');
        expect(tables).not.toContain('session');
    });
});
