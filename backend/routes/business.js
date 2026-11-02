const express = require('express');
const { wrap } = require('../utils/http');
const losses = require('../services/losses');
const sales = require('../services/sales');
const { dashboard } = require('../services/dashboard');

module.exports = (db) => {
    const router = express.Router();

    router.get('/losses', wrap((req, res) => res.json(losses.listLosses(db, req.query))));
    router.get('/losses/reasons', wrap((req, res) => res.json(losses.REASONS)));
    router.post('/losses', wrap((req, res) => res.status(201).json(losses.createLoss(db, req.body))));

    router.get('/sales', wrap((req, res) => res.json(sales.listSales(db, req.query))));
    router.post('/sales', wrap((req, res) => res.status(201).json(sales.createSales(db, req.body))));
    router.post('/sales/import', wrap((req, res) => {
        const result = sales.importSalesCsv(db, req.body);
        res.status(result.errors.length ? 422 : 201).json(result);
    }));

    router.get('/dashboard', wrap((req, res) => res.json(dashboard(db, req.query))));

    return router;
};
