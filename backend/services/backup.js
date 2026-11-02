const fs = require('fs');
const path = require('path');
const { httpError } = require('../utils/http');
const { getSetting } = require('./settings');
const { dayString } = require('./stock');

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'backups');
const NAME_RE = /^haccp-(\d{8})-(\d{6})\.db$/;

let lastError = null; // last failure of the scheduled backup, shown in the settings

const backupDir = (db) => getSetting(db, 'backup_dir') || DEFAULT_DIR;

function stamp(now) {
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function listBackups(db) {
    const dir = backupDir(db);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort().reverse()
        .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
}

// Consistent copy of the live database (VACUUM INTO), then keep the N newest files.
// The folder can be a synced one (Google Drive, USB key): if it is unreachable the error
// is reported and the app keeps running.
function runBackup(db, { now = new Date() } = {}) {
    const dir = backupDir(db);
    try {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `haccp-${stamp(now)}.db`);
        if (fs.existsSync(file)) throw httpError(409, 'Une sauvegarde existe deja pour cette seconde');
        db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
        const keep = getSetting(db, 'backup_keep');
        for (const old of listBackups(db).slice(keep)) fs.unlinkSync(path.join(dir, old.name));
        lastError = null;
        return { file, kept: Math.min(listBackups(db).length, keep) };
    } catch (err) {
        lastError = err.message;
        throw err.status ? err : httpError(500, `Sauvegarde impossible: ${err.message}`);
    }
}

function hasBackupToday(db, now = new Date()) {
    const today = stamp(now).slice(0, 8);
    return listBackups(db).some(b => b.name.slice(6, 14) === today);
}

function status(db, now = new Date()) {
    const files = listBackups(db);
    const last = files[0] ? files[0].name.match(NAME_RE) : null;
    const lastDay = last ? `${last[1].slice(0, 4)}-${last[1].slice(4, 6)}-${last[1].slice(6, 8)}` : null;
    return {
        dir: backupDir(db),
        count: files.length,
        last_day: lastDay,
        // more than one day without a backup means something is wrong (PC off, folder missing)
        stale: !lastDay || lastDay < dayString(now, -1),
        last_error: lastError,
        files: files.slice(0, 10),
    };
}

// Daily: check at start and every hour, back up once a day.
function startScheduler(db, { intervalMs = 3600 * 1000 } = {}) {
    const tick = () => {
        try {
            if (!hasBackupToday(db)) runBackup(db);
        } catch (err) {
            console.error('Sauvegarde quotidienne en echec:', err.message);
        }
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return timer;
}

module.exports = { runBackup, listBackups, status, hasBackupToday, startScheduler };
