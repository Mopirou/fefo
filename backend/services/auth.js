const crypto = require('crypto');
const { httpError } = require('../utils/http');

const COOKIE = 'haccp_session';
const SESSION_DAYS = 14;
const MAX_FAILURES = 5;
const LOCK_MS = 60 * 1000;
const PIN_RE = /^\d{4,8}$/;

// Failed-attempt counter per user (memory only: a restart clears it, which is fine here).
const failures = new Map();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');

function activeUserCount(db) {
    return db.prepare('SELECT COUNT(*) AS n FROM app_user WHERE active = 1').get().n;
}

function publicUser(u) {
    return { id: u.id, name: u.name, active: !!u.active };
}

function listUsers(db) {
    return db.prepare('SELECT id, name, active FROM app_user ORDER BY name COLLATE NOCASE').all()
        .map(u => ({ ...u, active: !!u.active }));
}

function checkPin(pin) {
    if (!PIN_RE.test(String(pin ?? ''))) throw httpError(400, 'Le code PIN doit contenir 4 a 8 chiffres');
    return String(pin);
}

function createUser(db, { name, pin }) {
    const n = String(name ?? '').trim();
    if (!n) throw httpError(400, 'name requis');
    const salt = crypto.randomBytes(16).toString('hex');
    try {
        const id = db.prepare('INSERT INTO app_user (name, pin_salt, pin_hash) VALUES (?, ?, ?)')
            .run(n, salt, hashPin(checkPin(pin), salt)).lastInsertRowid;
        return publicUser(db.prepare('SELECT * FROM app_user WHERE id = ?').get(id));
    } catch (err) {
        if (/UNIQUE constraint failed: app_user\.name/.test(err.message)) throw httpError(409, 'Ce nom existe deja');
        throw err;
    }
}

function updateUser(db, id, { name, pin, active }) {
    const user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(id);
    if (!user) throw httpError(404, 'Utilisateur introuvable');
    const nextName = name === undefined ? user.name : String(name).trim();
    if (!nextName) throw httpError(400, 'name invalide');
    const nextActive = active === undefined ? user.active : (active ? 1 : 0);
    if (user.active && !nextActive && activeUserCount(db) <= 1) {
        throw httpError(409, 'Impossible de desactiver le dernier utilisateur');
    }
    let salt = user.pin_salt;
    let hash = user.pin_hash;
    if (pin !== undefined && pin !== '') {
        salt = crypto.randomBytes(16).toString('hex');
        hash = hashPin(checkPin(pin), salt);
    }
    try {
        db.prepare('UPDATE app_user SET name = ?, pin_salt = ?, pin_hash = ?, active = ? WHERE id = ?')
            .run(nextName, salt, hash, nextActive, id);
    } catch (err) {
        if (/UNIQUE constraint failed/.test(err.message)) throw httpError(409, 'Ce nom existe deja');
        throw err;
    }
    if (!nextActive) db.prepare('DELETE FROM session WHERE user_id = ?').run(id);
    return publicUser(db.prepare('SELECT * FROM app_user WHERE id = ?').get(id));
}

function login(db, userId, pin, { now = Date.now() } = {}) {
    const state = failures.get(userId) || { count: 0, until: 0 };
    if (state.until > now) throw httpError(429, 'Trop d\'essais: reessayer dans une minute');
    const user = db.prepare('SELECT * FROM app_user WHERE id = ? AND active = 1').get(userId);
    const ok = user && PIN_RE.test(String(pin ?? '')) &&
        crypto.timingSafeEqual(Buffer.from(hashPin(String(pin), user.pin_salt), 'hex'), Buffer.from(user.pin_hash, 'hex'));
    if (!ok) {
        state.count += 1;
        if (state.count >= MAX_FAILURES) { state.until = now + LOCK_MS; state.count = 0; }
        failures.set(userId, state);
        throw httpError(401, 'Code PIN incorrect');
    }
    failures.delete(userId);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(now + SESSION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM session WHERE expires_at < ?').run(new Date(now).toISOString());
    db.prepare('INSERT INTO session (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), user.id, expires);
    return { token, user: publicUser(user), maxAge: SESSION_DAYS * 86400 };
}

function logout(db, token) {
    if (token) db.prepare('DELETE FROM session WHERE token_hash = ?').run(sha256(token));
}

function readCookie(req) {
    const m = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}

function userFromToken(db, token) {
    if (!token) return null;
    const row = db.prepare(
        `SELECT u.id, u.name FROM session s JOIN app_user u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`
    ).get(sha256(token), new Date().toISOString());
    return row || null;
}

function setCookie(res, req, token, maxAge) {
    const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`];
    if (req.secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

module.exports = {
    activeUserCount, listUsers, createUser, updateUser, login, logout, readCookie, userFromToken, setCookie,
    clearFailures: () => failures.clear(),
};
