const express = require('express');
const productsController = require('../controllers/products');

module.exports = (db) => {
    const router = express.Router();
    const c = productsController(db);
    router.get('/', c.list);
    router.get('/ean/:ean', c.byEan);
    router.get('/:id', c.get);
    router.post('/', c.create);
    router.put('/:id', c.update);
    router.delete('/:id', c.remove);
    return router;
};
