const express = require('express');
const { wrap } = require('../utils/http');
const backup = require('../services/backup');
const exporter = require('../services/exporter');

module.exports = (db) => {
    const router = express.Router();

    router.get('/backup/status', wrap((req, res) => res.json(backup.status(db))));
    router.post('/backup/run', wrap((req, res) => res.status(201).json(backup.runBackup(db))));

    router.get('/export', wrap((req, res) => res.json(exporter.listTables())));
    router.get('/export/:table.csv', wrap((req, res) => {
        const csv = exporter.tableCsv(db, req.params.table);
        res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${req.params.table}.csv"`).send(csv);
    }));

    return router;
};
