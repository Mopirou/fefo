const express = require('express');
const { wrap } = require('../utils/http');
const haccp = require('../services/haccp');
const reports = require('../services/reports');
const { getBatch } = require('../services/batches');

module.exports = (db) => {
    const router = express.Router();
    const id = (req) => Number(req.params.id);
    const pdf = (res, buf, name) => res.type('application/pdf').set('Content-Disposition', `inline; filename="${name}"`).send(buf);

    router.get('/haccp/todo', wrap((req, res) => res.json(haccp.todo(db, req.query.day))));

    router.get('/fridges', wrap((req, res) => res.json(haccp.listFridges(db, { all: req.query.all === '1' }))));
    router.get('/fridges/kinds', wrap((req, res) => res.json(haccp.KIND_MAX)));
    router.post('/fridges', wrap((req, res) => res.status(201).json(haccp.saveFridge(db, req.body))));
    router.put('/fridges/:id', wrap((req, res) => res.json(haccp.saveFridge(db, req.body, id(req)))));

    router.get('/temperatures', wrap((req, res) => res.json(haccp.listReadings(db, req.query))));
    router.post('/temperatures', wrap((req, res) => res.status(201).json(haccp.addReading(db, req.body))));
    router.put('/temperatures/:id/action', wrap((req, res) => {
        haccp.setAction(db, 'temp_reading', id(req), req.body.action);
        res.status(204).end();
    }));

    router.get('/cooling', wrap((req, res) => res.json(haccp.listCooling(db, req.query))));
    router.post('/cooling', wrap((req, res) => res.status(201).json(haccp.addCooling(db, req.body))));
    router.put('/cooling/:id/action', wrap((req, res) => {
        haccp.setAction(db, 'cooling_record', id(req), req.body.action);
        res.status(204).end();
    }));

    router.get('/cleaning', wrap((req, res) => res.json(haccp.cleaningStatus(db, req.query.day))));
    router.post('/cleaning/tasks', wrap((req, res) => res.status(201).json(haccp.saveTask(db, req.body))));
    router.put('/cleaning/tasks/:id', wrap((req, res) => res.json(haccp.saveTask(db, req.body, id(req)))));
    router.put('/cleaning/tasks/:id/check', wrap((req, res) => {
        haccp.setCheck(db, id(req), req.body.day, req.body.done !== false);
        res.status(204).end();
    }));

    router.get('/haccp/report.pdf', wrap(async (req, res) => pdf(res, await reports.registerPdf(db, req.query), 'registres-haccp.pdf')));

    router.get('/lots/:id/trace', wrap((req, res) => res.json(reports.traceLot(db, id(req)))));
    router.get('/lots/:id/trace.pdf', wrap(async (req, res) => pdf(res, await reports.tracePdf(db, id(req)), `tracabilite-lot-${id(req)}.pdf`)));
    router.get('/batches/:id/trace.pdf', wrap(async (req, res) => {
        const batch = getBatch(db, id(req));
        pdf(res, await reports.tracePdf(db, batch.lot_id), `tracabilite-${batch.lot_no}.pdf`);
    }));

    return router;
};
