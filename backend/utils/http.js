function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

// Wraps a route handler: maps thrown httpError to its status, anything else to 500.
const wrap = (fn) => (req, res) => {
    try {
        fn(req, res);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

module.exports = { httpError, wrap };
