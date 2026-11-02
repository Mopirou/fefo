const path = require('path');
const { execFile } = require('child_process');
const { httpError } = require('../utils/http');
const { labelLines } = require('./labels');
const { getSetting } = require('./settings');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'print-label.ps1');
const IS_WIN = process.platform === 'win32';

function run(cmd, args, input) {
    return new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || err.message).toString().trim()));
            resolve(stdout.toString());
        });
        if (input !== undefined) child.stdin.end(input);
    });
}

async function listPrinters() {
    if (IS_WIN) {
        const out = await run('powershell.exe', ['-NoProfile', '-Command',
            'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress']);
        const parsed = out.trim() ? JSON.parse(out) : [];
        return Array.isArray(parsed) ? parsed : [parsed];
    }
    const out = await run('lpstat', ['-e']).catch(() => '');
    return out.split('\n').map(s => s.trim()).filter(Boolean);
}

// Sends the label to the printer chosen in settings through the system print queue
// (Windows spooler / CUPS). Job data goes through stdin, never through the command line.
async function sendToPrinter(printer, lines) {
    if (IS_WIN) {
        await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
            JSON.stringify({ printer, lines }));
    } else {
        const args = printer ? ['-d', printer] : [];
        await run('lp', args, lines.map(l => l.text).join('\n') + '\n');
    }
}

// `driver` is injectable so tests never touch a real printer.
async function printBatchLabel(db, batchId, { driver = sendToPrinter } = {}) {
    const printer = getSetting(db, 'printer');
    if (!printer) throw httpError(409, 'Aucune imprimante choisie dans les reglages');
    try {
        await driver(printer, labelLines(db, batchId));
    } catch (err) {
        throw httpError(502, `Echec d'impression: ${err.message}`);
    }
    return { printed: true, printer };
}

module.exports = { listPrinters, printBatchLabel, sendToPrinter };
