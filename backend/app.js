const fs = require('fs');
const path = require('path');
const express = require('express');
const { authRoutes, guard, userRoutes } = require('./routes/auth');

// options.printDriver replaces the real printer (tests).
// No CORS: the app and the API share one origin (Express in production, Vite proxy in dev),
// so other websites cannot call the API from a browser on this network.
function createApp(db, options = {}) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    app.get('/health', (req, res) => res.json({ ok: true }));
    app.use('/api/auth', authRoutes(db));
    app.use('/api', guard(db));
    app.use('/api/users', userRoutes(db));
    app.use('/api/products', require('./routes/products')(db));
    app.use('/api', require('./routes/stock')(db));
    app.use('/api', require('./routes/preparations')(db, options));
    app.use('/api', require('./routes/business')(db));
    app.use('/api', require('./routes/haccp')(db));
    app.use('/api', require('./routes/admin')(db));

    // Production: serve the built Vue app from the same HTTPS origin.
    const dist = path.join(__dirname, '..', 'frontend', 'dist');
    if (fs.existsSync(dist)) {
        app.use(express.static(dist));
        app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
    return app;
}

module.exports = { createApp };
