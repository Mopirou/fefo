// Minimal CSV reader: quoted fields, "" escapes, ; or , or tab delimiter (auto-detected).
function parseCsv(text) {
    const src = String(text).replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const count = (c) => firstLine.split(c).length - 1;
    const delim = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];

    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === delim) { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some(f => f.trim() !== '')) rows.push(row);
            row = [];
        } else field += c;
    }
    row.push(field);
    if (row.some(f => f.trim() !== '')) rows.push(row);
    return rows;
}

// "1,5" or "1.5" -> 1.5
const parseNumber = (s) => Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));

// 2026-11-02 or 02/11/2026 -> 2026-11-02 (null if invalid)
function parseDate(s) {
    const v = String(s).trim();
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

module.exports = { parseCsv, parseNumber, parseDate };
