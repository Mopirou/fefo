require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { openDb } = require('./config/db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 3100);
const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, '..', 'certs');
const keyFile = path.join(CERT_DIR, 'key.pem');
const certFile = path.join(CERT_DIR, 'cert.pem');

const db = openDb(process.env.DB_FILE || undefined);
const app = createApp(db);
require('./services/backup').startScheduler(db);

// Camera access on the phone requires HTTPS (mkcert certificate, see README).
if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
        .listen(PORT, '0.0.0.0', () => console.log(`HACCP: https://0.0.0.0:${PORT}`));
} else {
    console.warn('Certificats absents (certs/key.pem, certs/cert.pem): demarrage en HTTP, le scan camera ne marchera pas sur telephone.');
    http.createServer(app).listen(PORT, '0.0.0.0', () => console.log(`HACCP: http://0.0.0.0:${PORT}`));
}
