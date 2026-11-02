const { httpError } = require('../utils/http');

// Defaults come from the HACCP rules of the spec; every one can be changed in the settings.
const SCHEMA = {
    prep_dlc_max_days: { default: 3, min: 1, max: 30, label: 'DLC maximale d\'une preparation (jours)' },
    thaw_dlc_hours: { default: 24, min: 1, max: 48, label: 'DLC apres decongelation (heures, max 48)' },
    cooling_max_minutes: { default: 120, min: 10, max: 600, label: 'Refroidissement rapide: duree max (minutes)' },
    cooling_target_temp: { default: 10, min: 0, max: 30, label: 'Refroidissement rapide: temperature a atteindre (C)' },
    establishment: { default: '', label: 'Nom de l\'etablissement (en-tete des exports)' },
    printer: { default: '', label: 'Imprimante d\'etiquettes' },
};

function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    const def = SCHEMA[key].default;
    if (!row) return def;
    return typeof def === 'number' ? Number(row.value) : row.value;
}

function allSettings(db) {
    return Object.fromEntries(Object.keys(SCHEMA).map(k => [k, getSetting(db, k)]));
}

function updateSettings(db, input) {
    for (const [key, raw] of Object.entries(input || {})) {
        const spec = SCHEMA[key];
        if (!spec) throw httpError(400, `Reglage inconnu: ${key}`);
        if (typeof spec.default === 'number') {
            const n = Number(raw);
            if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
                throw httpError(400, `${key} doit etre un entier entre ${spec.min} et ${spec.max}`);
            }
        }
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .run(key, String(raw ?? ''));
    }
    return allSettings(db);
}

module.exports = { getSetting, allSettings, updateSettings };
