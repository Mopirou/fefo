const express = require('express');
const { wrap } = require('../utils/http');
const stock = require('../services/stock');

module.exports = (db) => {
    const router = express.Router();

    router.post('/receipts', wrap((req, res) => {
        res.status(201).json(stock.receive(db, req.body));
    }));

    router.get('/receipts/refused', wrap((req, res) => {
        res.json(stock.refusedReceipts(db));
    }));

    router.get('/stock', wrap((req, res) => {
        res.json(stock.stockSummary(db));
    }));

    router.get('/stock/lots', wrap((req, res) => {
        res.json(stock.availableLots(db, Number(req.query.product_id), { includeExpired: true }));
    }));

    router.post('/stock/consume', wrap((req, res) => {
        const { product_id, qty, reason, ref } = req.body;
        res.json(stock.fefoConsume(db, product_id, qty, { reason, ref }));
    }));

    router.get('/alerts', wrap((req, res) => {
        res.json(stock.alerts(db));
    }));

    router.post('/inventory', wrap((req, res) => {
        res.json(stock.applyInventory(db, req.body.counts));
    }));

    return router;
};
