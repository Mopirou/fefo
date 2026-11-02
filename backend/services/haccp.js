const { httpError } = require('../utils/http');
const { dayString } = require('./stock');
const { getSetting } = require('./settings');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Default max temperature per kind of unit (arrete du 21/12/2009, annexe I).
// Editable per unit, since it must match what the unit actually contains.
const KIND_MAX = { preparations: 3, tres_perissable: 4, perissable: 8, surgele: -18 };
const SLOTS = ['matin', 'soir'];

function checkDay(day) {
    const d = day || dayString();
    if (!DATE_RE.test(d)) throw httpError(400, 'date doit etre au format AAAA-MM-JJ');
    return d;
}
const text = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// ---- fridges ----
function listFridges(db, { all = false } = {}) {
    return db.prepare(`SELECT * FROM fridge ${all ? '' : 'WHERE active = 1'} ORDER BY name COLLATE NOCASE`).all();
}

function saveFridge(db, body, id = null) {
    const name = String(body.name ?? '').trim();
    if (!name) throw httpError(400, 'name requis');
    if (!Object.hasOwn(KIND_MAX, body.kind)) throw httpError(400, `kind doit etre: ${Object.keys(KIND_MAX).join(', ')}`);
    const max = body.max_temp === undefined || body.max_temp === null || body.max_temp === '' ? KIND_MAX[body.kind] : Number(body.max_temp);
    if (!Number.isFinite(max)) throw httpError(400, 'max_temp invalide');
    const active = body.active === false || body.active === 0 ? 0 : 1;
    try {
        if (id === null) {
            id = db.prepare('INSERT INTO fridge (name, kind, max_temp, contents) VALUES (?, ?, ?, ?)')
                .run(name, body.kind, max, text(body.contents)).lastInsertRowid;
        } else {
            const info = db.prepare('UPDATE fridge SET name = ?, kind = ?, max_temp = ?, contents = ?, active = ? WHERE id = ?')
                .run(name, body.kind, max, text(body.contents), active, id);
            if (!info.changes) throw httpError(404, 'Enceinte introuvable');
        }
    } catch (err) {
        if (/UNIQUE constraint failed: fridge\.name/.test(err.message)) throw httpError(409, 'Une enceinte porte deja ce nom');
        throw err;
    }
    return db.prepare('SELECT * FROM fridge WHERE id = ?').get(id);
}

// ---- temperature readings ----
function addReading(db, body, { now = new Date() } = {}) {
    const fridge = db.prepare('SELECT * FROM fridge WHERE id = ?').get(body.fridge_id);
    if (!fridge) throw httpError(404, 'Enceinte introuvable');
    if (!SLOTS.includes(body.slot)) throw httpError(400, `slot doit etre: ${SLOTS.join(', ')}`);
    const value = Number(body.value);
    if (body.value === '' || body.value === null || !Number.isFinite(value)) throw httpError(400, 'value invalide');
    const alert = value > fridge.max_temp ? 1 : 0;
    const id = db.prepare(
        'INSERT INTO temp_reading (fridge_id, day, slot, value, max_temp, alert, action) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(fridge.id, checkDay(body.day || dayString(now)), body.slot, value, fridge.max_temp, alert, text(body.action)).lastInsertRowid;
    return db.prepare('SELECT * FROM temp_reading WHERE id = ?').get(id);
}

function listReadings(db, { from, to } = {}) {
    return db.prepare(
        `SELECT t.*, f.name AS fridge_name, u.name AS user_name FROM temp_reading t JOIN fridge f ON f.id = t.fridge_id
         LEFT JOIN app_user u ON u.id = t.user_id
         WHERE t.day >= ? AND t.day <= ? ORDER BY t.day DESC, t.slot, f.name`
    ).all(from || '0000-00-00', to || '9999-12-31');
}

function setAction(db, table, id, action) {
    const a = text(action);
    if (!a) throw httpError(400, 'action requise');
    const info = db.prepare(`UPDATE ${table} SET action = ? WHERE id = ?`).run(a, id);
    if (!info.changes) throw httpError(404, 'Releve introuvable');
}

// ---- rapid cooling ----
function addCooling(db, body) {
    const label = text(body.label);
    let batch = null;
    if (body.batch_id) {
        batch = db.prepare(
            `SELECT b.id, r.name FROM prep_batch b JOIN recipe r ON r.id = b.recipe_id WHERE b.id = ?`
        ).get(body.batch_id);
        if (!batch) throw httpError(404, 'Lot fabrique introuvable');
    }
    if (!label && !batch) throw httpError(400, 'label ou batch_id requis');
    if (!DATETIME_RE.test(String(body.start_at)) || !DATETIME_RE.test(String(body.end_at))) {
        throw httpError(400, 'start_at et end_at doivent etre au format AAAA-MM-JJTHH:MM');
    }
    const startTemp = Number(body.start_temp);
    const endTemp = Number(body.end_temp);
    if (!Number.isFinite(startTemp) || !Number.isFinite(endTemp)) throw httpError(400, 'temperatures invalides');
    const minutes = Math.round((new Date(body.end_at) - new Date(body.start_at)) / 60000);
    if (!(minutes >= 0)) throw httpError(400, 'La fin doit etre apres le debut');

    // Alert when too slow or when the target temperature was not reached.
    const alert = minutes > getSetting(db, 'cooling_max_minutes') || endTemp > getSetting(db, 'cooling_target_temp') ? 1 : 0;
    const id = db.prepare(
        `INSERT INTO cooling_record (batch_id, label, day, start_at, start_temp, end_at, end_temp, minutes, alert, action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(batch ? batch.id : null, label || batch.name, String(body.start_at).slice(0, 10), body.start_at, startTemp,
        body.end_at, endTemp, minutes, alert, text(body.action)).lastInsertRowid;
    return db.prepare('SELECT * FROM cooling_record WHERE id = ?').get(id);
}

function listCooling(db, { from, to } = {}) {
    return db.prepare(`SELECT c.*, u.name AS user_name FROM cooling_record c LEFT JOIN app_user u ON u.id = c.user_id
         WHERE c.day >= ? AND c.day <= ? ORDER BY c.start_at DESC`)
        .all(from || '0000-00-00', to || '9999-12-31');
}

// ---- cleaning plan ----
function listTasks(db) {
    return db.prepare('SELECT * FROM cleaning_task WHERE active = 1 ORDER BY frequency, name COLLATE NOCASE').all();
}

function saveTask(db, body, id = null) {
    const name = text(body.name);
    if (!name) throw httpError(400, 'name requis');
    if (!['quotidien', 'hebdomadaire', 'mensuel'].includes(body.frequency)) throw httpError(400, 'frequency invalide');
    if (id === null) {
        id = db.prepare('INSERT INTO cleaning_task (name, frequency) VALUES (?, ?)').run(name, body.frequency).lastInsertRowid;
    } else {
        const info = db.prepare('UPDATE cleaning_task SET name = ?, frequency = ?, active = ? WHERE id = ?')
            .run(name, body.frequency, body.active === false ? 0 : 1, id);
        if (!info.changes) throw httpError(404, 'Tache introuvable');
    }
    return db.prepare('SELECT * FROM cleaning_task WHERE id = ?').get(id);
}

// Period a check covers: the day, its Monday-Sunday week, or its month.
function periodOf(frequency, day) {
    const d = new Date(`${day}T12:00:00`);
    if (frequency === 'quotidien') return [day, day];
    if (frequency === 'hebdomadaire') {
        const shift = (d.getDay() + 6) % 7; // Monday = 0
        return [dayString(d, -shift), dayString(d, 6 - shift)];
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [dayString(first), dayString(last)];
}

function cleaningStatus(db, day) {
    const d = checkDay(day);
    return listTasks(db).map(t => {
        const [from, to] = periodOf(t.frequency, d);
        const check = db.prepare('SELECT * FROM cleaning_check WHERE task_id = ? AND day >= ? AND day <= ? ORDER BY day LIMIT 1').get(t.id, from, to);
        return { ...t, done: !!check, done_on: check ? check.day : null, period_from: from, period_to: to };
    });
}

function setCheck(db, taskId, day, done) {
    const d = checkDay(day);
    if (!db.prepare('SELECT 1 FROM cleaning_task WHERE id = ?').get(taskId)) throw httpError(404, 'Tache introuvable');
    if (done) db.prepare('INSERT OR IGNORE INTO cleaning_check (task_id, day) VALUES (?, ?)').run(taskId, d);
    else db.prepare('DELETE FROM cleaning_check WHERE task_id = ? AND day = ?').run(taskId, d);
}

// ---- daily to-do: missing readings, uncorrected alerts, pending cleaning ----
function todo(db, day) {
    const d = checkDay(day);
    const missing = [];
    for (const f of listFridges(db)) {
        for (const slot of SLOTS) {
            const r = db.prepare('SELECT 1 FROM temp_reading WHERE fridge_id = ? AND day = ? AND slot = ?').get(f.id, d, slot);
            if (!r) missing.push({ fridge_id: f.id, fridge_name: f.name, slot });
        }
    }
    const since = dayString(new Date(`${d}T12:00:00`), -30);
    return {
        day: d,
        missing_readings: missing,
        open_alerts: {
            readings: db.prepare(
                `SELECT t.*, f.name AS fridge_name FROM temp_reading t JOIN fridge f ON f.id = t.fridge_id
                 WHERE t.alert = 1 AND t.action IS NULL AND t.day >= ? ORDER BY t.day DESC`
            ).all(since),
            cooling: db.prepare('SELECT * FROM cooling_record WHERE alert = 1 AND action IS NULL AND day >= ? ORDER BY day DESC').all(since),
        },
        cleaning_pending: cleaningStatus(db, d).filter(t => !t.done),
    };
}

module.exports = {
    KIND_MAX, listFridges, saveFridge, addReading, listReadings, setAction, addCooling, listCooling,
    listTasks, saveTask, cleaningStatus, setCheck, todo, periodOf,
};
