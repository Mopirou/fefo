const express = require('express');
const { wrap } = require('../utils/http');
const { runAs } = require('../utils/context');
const auth = require('../services/auth');

// Login endpoints (public) and the guard for everything else under /api.
// Until the first user exists the app stays open; from then on every request needs a session.
function authRoutes(db) {
    const router = express.Router();

    router.get('/status', wrap((req, res) => {
        const required = auth.activeUserCount(db) > 0;
        const user = auth.userFromToken(db, auth.readCookie(req));
        res.json({
            auth_required: required,
            user,
            users: required && !user ? auth.listUsers(db).filter(u => u.active).map(u => ({ id: u.id, name: u.name })) : [],
        });
    }));

    router.post('/login', wrap((req, res) => {
        const r = auth.login(db, Number(req.body.user_id), req.body.pin);
        auth.setCookie(res, req, r.token, r.maxAge);
        res.json({ user: { id: r.user.id, name: r.user.name } });
    }));

    router.post('/logout', wrap((req, res) => {
        auth.logout(db, auth.readCookie(req));
        auth.setCookie(res, req, '', 0);
        res.status(204).end();
    }));

    return router;
}

function guard(db) {
    return (req, res, next) => {
        if (auth.activeUserCount(db) === 0) return runAs(null, next);
        const user = auth.userFromToken(db, auth.readCookie(req));
        if (!user) return res.status(401).json({ error: 'Connexion requise' });
        req.user = user;
        runAs(user.id, next);
    };
}

function userRoutes(db) {
    const router = express.Router();
    router.get('/', wrap((req, res) => res.json(auth.listUsers(db))));
    router.post('/', wrap((req, res) => {
        const first = auth.activeUserCount(db) === 0;
        const user = auth.createUser(db, req.body);
        if (first) { // creating the first account turns the protection on: sign the creator in
            const r = auth.login(db, user.id, req.body.pin);
            auth.setCookie(res, req, r.token, r.maxAge);
        }
        res.status(201).json(user);
    }));
    router.put('/:id', wrap((req, res) => res.json(auth.updateUser(db, Number(req.params.id), req.body))));
    return router;
}

module.exports = { authRoutes, guard, userRoutes };
