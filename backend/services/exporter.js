const { httpError } = require('../utils/http');

// Tables that can be exported. Secrets (PIN hashes, sessions) are never exported.
const TABLES = {
    product: '*', lot: '*', stock_move: '*', inventory_count: '*',
    recipe: '*', recipe_item: '*', prep_batch: '*', prep_batch_source: '*',
    sale: '*', loss: '*',
    fridge: '*', temp_reading: '*', cooling_record: '*', cleaning_task: '*', cleaning_check: '*',
    settings: '*',
    app_user: 'id, name, active, created_at',
};

function cell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Semicolon separated with a BOM and CRLF: opens correctly in French Excel.
function tableCsv(db, table) {
    if (!Object.hasOwn(TABLES, table)) throw httpError(404, 'Table inconnue');
    const rows = db.prepare(`SELECT ${TABLES[table]} FROM ${table}`).all();
    const cols = rows.length ? Object.keys(rows[0])
        : db.prepare(`SELECT ${TABLES[table]} FROM ${table} LIMIT 0`).columns().map(c => c.name);
    const lines = [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))];
    return '﻿' + lines.join('\r\n') + '\r\n';
}

const listTables = () => Object.keys(TABLES);

module.exports = { tableCsv, listTables };
