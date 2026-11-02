const PDFDocument = require('pdfkit');
const { httpError } = require('../utils/http');
const { dayString } = require('./stock');
const { getSetting } = require('./settings');
const haccp = require('./haccp');

const MAX_DEPTH = 6;
const fr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const hm = (iso) => String(iso).slice(11, 16);

// ---------------------------------------------------------------- traceability

function lotNode(db, lotId) {
    return db.prepare(
        `SELECT l.id AS lot_id, l.lot_no, l.dlc, l.received_at, l.recv_temp, l.conform, l.source,
                p.name AS product_name, p.supplier, p.unit,
                COALESCE((SELECT SUM(delta) FROM stock_move WHERE lot_id = l.id), 0) AS qty_left
         FROM lot l JOIN product p ON p.id = l.product_id WHERE l.id = ?`
    ).get(lotId);
}

// What went into this lot: for a preparation, its batch and the lots consumed (recursively).
function upstream(db, lotId, depth = 0) {
    const node = lotNode(db, lotId);
    const batch = db.prepare(
        `SELECT b.id, b.made_at, b.qty, b.justification, r.name FROM prep_batch b JOIN recipe r ON r.id = b.recipe_id WHERE b.lot_id = ?`
    ).get(lotId);
    node.batch = batch || null;
    node.sources = [];
    if (batch && depth < MAX_DEPTH) {
        const rows = db.prepare('SELECT lot_id, qty FROM prep_batch_source WHERE batch_id = ? ORDER BY rowid').all(batch.id);
        node.sources = rows.map(s => ({ ...upstream(db, s.lot_id, depth + 1), qty_used: s.qty }));
    }
    return node;
}

// Where this lot went: batches that consumed it (recursively), and its other movements.
function downstream(db, lotId, depth = 0) {
    const node = lotNode(db, lotId);
    node.movements = db.prepare(
        `SELECT reason, SUM(-delta) AS qty, COUNT(*) AS n FROM stock_move
         WHERE lot_id = ? AND reason NOT IN ('receipt', 'prep_out', 'prep_use', 'freeze', 'thaw') GROUP BY reason`
    ).all(lotId);
    node.used_in = [];
    if (depth < MAX_DEPTH) {
        const rows = db.prepare(
            `SELECT b.id AS batch_id, b.lot_id, b.made_at, r.name, s.qty AS qty_used
             FROM prep_batch_source s JOIN prep_batch b ON b.id = s.batch_id JOIN recipe r ON r.id = b.recipe_id
             WHERE s.lot_id = ? ORDER BY b.id`
        ).all(lotId);
        node.used_in = rows.map(r => ({ ...r, output: downstream(db, r.lot_id, depth + 1) }));
    }
    return node;
}

function traceLot(db, lotId) {
    if (!lotNode(db, lotId)) throw httpError(404, 'Lot introuvable');
    return { upstream: upstream(db, lotId), downstream: downstream(db, lotId) };
}

// ------------------------------------------------------------------ pdf helpers

function newDoc() {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    return { doc, done };
}

function ensureSpace(doc, h) {
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function header(doc, db, title, subtitle) {
    const name = getSetting(db, 'establishment');
    doc.font('Helvetica-Bold').fontSize(16).text(title);
    if (name) doc.font('Helvetica').fontSize(10).text(name);
    if (subtitle) doc.font('Helvetica').fontSize(10).text(subtitle);
    doc.font('Helvetica').fontSize(8).fillColor('#666').text(`Edite le ${fr(dayString())}`).fillColor('#000');
    doc.moveDown();
}

function section(doc, title) {
    ensureSpace(doc, 60);
    doc.x = doc.page.margins.left;
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).text(title).moveDown(0.3);
}

// cols: [{ label, width, get(row) }]. Rows with `_alert` print in red.
function table(doc, cols, rows) {
    const x0 = doc.page.margins.left;
    const rowH = 14;
    const drawRow = (cells, bold, red) => {
        ensureSpace(doc, rowH + 2);
        const y = doc.y;
        let x = x0;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(red ? '#b91c1c' : '#000');
        cols.forEach((c, i) => {
            doc.text(String(cells[i] ?? ''), x, y, { width: c.width - 4, height: rowH - 2, ellipsis: true, lineBreak: false });
            x += c.width;
        });
        doc.fillColor('#000');
        doc.y = y + rowH;
        doc.moveTo(x0, doc.y - 2).lineTo(x0 + cols.reduce((s, c) => s + c.width, 0), doc.y - 2).strokeColor('#ddd').lineWidth(0.5).stroke();
    };
    drawRow(cols.map(c => c.label), true, false);
    if (!rows.length) {
        doc.font('Helvetica-Oblique').fontSize(8).text('Aucun enregistrement sur la periode.', x0, doc.y);
        doc.moveDown(0.5);
    }
    for (const r of rows) drawRow(cols.map(c => c.get(r)), false, r._alert);
    doc.x = x0;
}

// -------------------------------------------------------------- HACCP registers

function registerPdf(db, { from, to }) {
    const start = from || dayString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const end = to || dayString();
    if (start > end) throw httpError(400, 'periode invalide');
    const { doc, done } = newDoc();
    header(doc, db, 'Registres HACCP', `Periode du ${fr(start)} au ${fr(end)}`);

    // Chronological order for the register: day, then morning before evening.
    const readings = haccp.listReadings(db, { from: start, to: end })
        .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot) || a.fridge_name.localeCompare(b.fridge_name));
    section(doc, 'Releves de temperature des enceintes');
    table(doc, [
        { label: 'Date', width: 60, get: r => fr(r.day) },
        { label: 'Enceinte', width: 100, get: r => r.fridge_name },
        { label: 'Creneau', width: 45, get: r => r.slot },
        { label: 'Releve', width: 50, get: r => `${r.value} °C` },
        { label: 'Seuil', width: 45, get: r => `${r.max_temp} °C` },
        { label: 'Statut', width: 50, get: r => (r.alert ? 'ALERTE' : 'OK') },
        { label: 'Saisi par', width: 55, get: r => r.user_name || '' },
        { label: 'Action corrective', width: 110, get: r => r.action || (r.alert ? 'NON RENSEIGNEE' : '') },
    ], readings.map(r => ({ ...r, _alert: !!r.alert })));

    const cooling = haccp.listCooling(db, { from: start, to: end }).reverse();
    section(doc, 'Refroidissement rapide (+63 °C a +10 °C en moins de 2 h)');
    table(doc, [
        { label: 'Date', width: 60, get: r => fr(r.day) },
        { label: 'Preparation', width: 100, get: r => r.label },
        { label: 'Debut', width: 60, get: r => `${hm(r.start_at)} / ${r.start_temp} °C` },
        { label: 'Fin', width: 60, get: r => `${hm(r.end_at)} / ${r.end_temp} °C` },
        { label: 'Duree', width: 45, get: r => `${r.minutes} min` },
        { label: 'Statut', width: 45, get: r => (r.alert ? 'ALERTE' : 'OK') },
        { label: 'Saisi par', width: 55, get: r => r.user_name || '' },
        { label: 'Action corrective', width: 90, get: r => r.action || (r.alert ? 'NON RENSEIGNEE' : '') },
    ], cooling.map(r => ({ ...r, _alert: !!r.alert })));

    section(doc, 'Plan de nettoyage');
    const checks = db.prepare('SELECT task_id, day FROM cleaning_check WHERE day >= ? AND day <= ? ORDER BY day').all(start, end);
    table(doc, [
        { label: 'Tache', width: 190, get: t => t.name },
        { label: 'Frequence', width: 70, get: t => t.frequency },
        { label: 'Nb', width: 30, get: t => t.dates.length },
        { label: 'Realise le', width: 235, get: t => t.dates.map(fr).join(', ') },
    ], haccp.listTasks(db).map(t => ({ ...t, dates: checks.filter(c => c.task_id === t.id).map(c => c.day) })));

    doc.end();
    return done;
}

// ------------------------------------------------------------- lot traceability

function describe(n) {
    const dlc = n.dlc ? `DLC ${fr(n.dlc)}` : 'sans DLC';
    return `${n.product_name} - lot ${n.lot_no || n.lot_id} - ${dlc}`;
}

function tracePdf(db, lotId) {
    const t = traceLot(db, lotId);
    const { doc, done } = newDoc();
    const lot = t.upstream;
    header(doc, db, 'Fiche de tracabilite', describe(lot));

    const line = (indent, str, { bold = false, red = false } = {}) => {
        ensureSpace(doc, 14);
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(red ? '#b91c1c' : '#000')
            .text(str, doc.page.margins.left + indent * 14, doc.y, { width: 500 - indent * 14 });
        doc.fillColor('#000');
    };

    section(doc, 'Lot');
    line(0, `Produit : ${lot.product_name}`);
    line(0, `Origine : ${lot.source === 'prep' ? 'preparation maison' : lot.source === 'inventory' ? 'regularisation d\'inventaire' : `fournisseur ${lot.supplier || 'non renseigne'}`}`);
    line(0, `Recu / fabrique le : ${fr(lot.received_at)}${lot.recv_temp !== null ? ` - temperature a reception ${lot.recv_temp} °C` : ''}`);
    line(0, `Conformite : ${lot.conform ? 'conforme' : 'NON CONFORME'} - quantite restante : ${lot.qty_left} ${lot.unit}`);
    if (lot.batch && lot.batch.justification) line(0, `Justification de DLC : ${lot.batch.justification}`);

    section(doc, 'Amont : de quoi est fait ce lot');
    const walkUp = (n, indent) => {
        if (n.batch) line(indent, `Preparation "${n.batch.name}" du ${fr(n.batch.made_at)} (lot ${n.lot_no || n.lot_id})`, { bold: true });
        for (const s of n.sources) {
            line(indent + 1, `${s.qty_used} ${s.unit} - ${describe(s)}${s.source === 'supplier' ? ` - ${s.supplier || 'fournisseur ?'}, recu le ${fr(s.received_at)}` : ''}`);
            walkUp(s, indent + 2);
        }
    };
    if (lot.batch) walkUp(lot, 0);
    else line(0, 'Lot recu d\'un fournisseur : pas de composant en amont.');

    section(doc, 'Aval : ce qu\'est devenu ce lot');
    const walkDown = (n, indent) => {
        for (const m of n.movements) line(indent, `${m.reason} : ${m.qty} ${n.unit} (${m.n} mouvement(s))`);
        for (const u of n.used_in) {
            line(indent, `Utilise ${u.qty_used} dans la preparation "${u.name}" du ${fr(u.made_at)} - lot ${u.output.lot_no || u.output.lot_id}`, { bold: true });
            walkDown(u.output, indent + 1);
        }
    };
    const down = t.downstream;
    walkDown(down, 0);
    if (!down.movements.length && !down.used_in.length) line(0, 'Aucune sortie enregistree.');
    line(0, `Reste en stock : ${down.qty_left} ${down.unit}`, { bold: true });

    doc.end();
    return done;
}

module.exports = { traceLot, tracePdf, registerPdf };
