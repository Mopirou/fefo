const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function migrate(db) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
    const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        if (done.has(file)) continue;
        db.exec('BEGIN');
        try {
            db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
            db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${err.message}`);
        }
    }
}

// filename ':memory:' is used by tests
function openDb(filename = path.join(__dirname, '..', 'data', 'haccp.db')) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    return db;
}

module.exports = { openDb };
