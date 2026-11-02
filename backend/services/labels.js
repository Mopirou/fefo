const PDFDocument = require('pdfkit');
const { getBatch, batchAllergens } = require('./batches');

const fr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Mandatory content: name, manufacture date, DLC, lot number, allergens.
// Layout/format work is out of V1 scope: this is a plain readable label.
function labelLines(db, batchId) {
    const b = getBatch(db, batchId);
    const allergens = batchAllergens(db, batchId);
    const lines = [
        { text: b.name, size: 14, bold: true },
        { text: `Fabrique le : ${fr(b.made_at)}`, size: 10 },
    ];
    if (b.state === 'frozen') {
        lines.push({ text: `CONGELE le ${fr(b.frozen_at)}`, size: 12, bold: true });
        lines.push({ text: `DLC avant congelation : ${fr(b.dlc)}`, size: 9 });
    } else {
        lines.push({ text: `DLC : ${fr(b.current_dlc)}`, size: 13, bold: true });
        if (b.state === 'thawed') lines.push({ text: `Decongele le ${fr(b.thawed_at)}`, size: 9 });
    }
    lines.push({ text: `Lot : ${b.lot_no}`, size: 10 });
    lines.push({ text: `Allergenes : ${allergens.length ? allergens.join(', ') : 'aucun declare'}`, size: 9 });
    return lines;
}

function labelPdf(db, batchId) {
    const lines = labelLines(db, batchId);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: [198, 142], margin: 8 }); // ~70 x 50 mm
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        for (const l of lines) {
            doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(l.size).text(l.text);
        }
        doc.end();
    });
}

module.exports = { labelLines, labelPdf };
