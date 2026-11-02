const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

function createApp(db) {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    app.get('/health', (req, res) => res.json({ ok: true }));
    app.use('/api/products', require('./routes/products')(db));

    // Production: serve the built Vue app from the same HTTPS origin.
    const dist = path.join(__dirname, '..', 'frontend', 'dist');
    if (fs.existsSync(dist)) {
        app.use(express.static(dist));
        app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
    return app;
}

module.exports = { createApp };
