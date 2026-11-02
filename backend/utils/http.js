function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

function fail(res, err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
}

// Wraps a route handler (sync or async): maps thrown httpError to its status, anything else to 500.
const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        fail(res, err);
    }
};

// Runs fn atomically. Uses savepoints so services can call each other
// (e.g. batch creation consuming stock) without nesting BEGIN.
let savepointId = 0;
function tx(db, fn) {
    const name = `sp_${++savepointId}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
    } catch (err) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw err;
    }
}

module.exports = { httpError, wrap, tx };
