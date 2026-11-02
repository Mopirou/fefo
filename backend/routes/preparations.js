const express = require('express');
const { wrap } = require('../utils/http');
const recipes = require('../services/recipes');
const batches = require('../services/batches');
const settings = require('../services/settings');
const { labelPdf } = require('../services/labels');
const printing = require('../services/printing');

module.exports = (db, { printDriver } = {}) => {
    const router = express.Router();
    const id = (req) => Number(req.params.id);

    router.get('/recipes', wrap((req, res) => res.json(recipes.listRecipes(db))));
    router.get('/recipes/:id', wrap((req, res) => res.json(recipes.getRecipe(db, id(req)))));
    router.post('/recipes', wrap((req, res) => res.status(201).json(recipes.saveRecipe(db, req.body))));
    router.put('/recipes/:id', wrap((req, res) => res.json(recipes.saveRecipe(db, req.body, id(req)))));
    router.delete('/recipes/:id', wrap((req, res) => { recipes.deleteRecipe(db, id(req)); res.status(204).end(); }));

    // Creating a batch can print its label at once; a print failure never undoes the batch.
    router.post('/batches', wrap(async (req, res) => {
        const batch = batches.createBatch(db, req.body);
        const out = { batch };
        if (req.body.print) {
            try {
                out.print = await printing.printBatchLabel(db, batch.id, { driver: printDriver });
            } catch (err) {
                out.print_error = err.message;
            }
        }
        res.status(201).json(out);
    }));
    router.get('/batches', wrap((req, res) => res.json(batches.listBatches(db))));
    router.get('/batches/:id', wrap((req, res) => res.json(batches.getBatch(db, id(req)))));
    router.post('/batches/:id/freeze', wrap((req, res) => res.json(batches.freeze(db, id(req)))));
    router.post('/batches/:id/thaw', wrap((req, res) => res.json(batches.thaw(db, id(req)))));
    router.get('/batches/:id/label.pdf', wrap(async (req, res) => {
        const pdf = await labelPdf(db, id(req));
        res.type('application/pdf').send(pdf);
    }));
    router.post('/batches/:id/print', wrap(async (req, res) => {
        res.json(await printing.printBatchLabel(db, id(req), { driver: printDriver }));
    }));

    router.get('/settings', wrap((req, res) => res.json(settings.allSettings(db))));
    router.put('/settings', wrap((req, res) => res.json(settings.updateSettings(db, req.body))));
    router.get('/printers', wrap(async (req, res) => res.json(await printing.listPrinters())));

    return router;
};
