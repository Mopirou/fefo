async function call(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !url.startsWith('/api/auth/login')) window.dispatchEvent(new Event('auth-required'));
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    // CSV import answers 422 with a line-by-line error list: let the caller show it.
    if (res.status === 422 && data.errors?.[0]?.line) return data;
    if (!res.ok) throw new Error((data.errors || [data.error]).filter(Boolean).join(', ') || `Erreur ${res.status}`);
    return data;
}

export const api = {
    listProducts: (params = {}) => call('GET', '/api/products?' + new URLSearchParams(params)),
    createProduct: (p) => call('POST', '/api/products', p),
    updateProduct: (id, p) => call('PUT', `/api/products/${id}`, p),
    deleteProduct: (id) => call('DELETE', `/api/products/${id}`),
    productByEan: (ean) => call('GET', `/api/products/ean/${ean}`),
    receive: (r) => call('POST', '/api/receipts', r),
    refusedReceipts: () => call('GET', '/api/receipts/refused'),
    stock: () => call('GET', '/api/stock'),
    lots: (productId) => call('GET', `/api/stock/lots?product_id=${productId}`),
    consume: (c) => call('POST', '/api/stock/consume', c),
    alerts: () => call('GET', '/api/alerts'),
    inventory: (counts) => call('POST', '/api/inventory', { counts }),
    recipes: () => call('GET', '/api/recipes'),
    recipeOptions: (id) => call('GET', `/api/recipes/${id}/options`),
    recipe: (id) => call('GET', `/api/recipes/${id}`),
    saveRecipe: (r) => (r.id ? call('PUT', `/api/recipes/${r.id}`, r) : call('POST', '/api/recipes', r)),
    deleteRecipe: (id) => call('DELETE', `/api/recipes/${id}`),
    batches: () => call('GET', '/api/batches'),
    createBatch: (b) => call('POST', '/api/batches', b),
    freeze: (id) => call('POST', `/api/batches/${id}/freeze`),
    thaw: (id) => call('POST', `/api/batches/${id}/thaw`),
    printBatch: (id) => call('POST', `/api/batches/${id}/print`),
    sales: (p = {}) => call('GET', '/api/sales?' + new URLSearchParams(p)),
    createSales: (s) => call('POST', '/api/sales', s),
    importSales: (s) => call('POST', '/api/sales/import', s),
    losses: (p = {}) => call('GET', '/api/losses?' + new URLSearchParams(p)),
    lossReasons: () => call('GET', '/api/losses/reasons'),
    createLoss: (l) => call('POST', '/api/losses', l),
    dashboard: (p) => call('GET', '/api/dashboard?' + new URLSearchParams(p)),
    todo: (day) => call('GET', '/api/haccp/todo' + (day ? `?day=${day}` : '')),
    fridges: (all) => call('GET', '/api/fridges' + (all ? '?all=1' : '')),
    fridgeKinds: () => call('GET', '/api/fridges/kinds'),
    saveFridge: (f) => (f.id ? call('PUT', `/api/fridges/${f.id}`, f) : call('POST', '/api/fridges', f)),
    temperatures: (p = {}) => call('GET', '/api/temperatures?' + new URLSearchParams(p)),
    addReading: (r) => call('POST', '/api/temperatures', r),
    readingAction: (id, action) => call('PUT', `/api/temperatures/${id}/action`, { action }),
    cooling: (p = {}) => call('GET', '/api/cooling?' + new URLSearchParams(p)),
    addCooling: (c) => call('POST', '/api/cooling', c),
    coolingAction: (id, action) => call('PUT', `/api/cooling/${id}/action`, { action }),
    cleaning: (day) => call('GET', '/api/cleaning' + (day ? `?day=${day}` : '')),
    saveTask: (t) => (t.id ? call('PUT', `/api/cleaning/tasks/${t.id}`, t) : call('POST', '/api/cleaning/tasks', t)),
    checkTask: (id, day, done) => call('PUT', `/api/cleaning/tasks/${id}/check`, { day, done }),
    authStatus: () => call('GET', '/api/auth/status'),
    login: (user_id, pin) => call('POST', '/api/auth/login', { user_id, pin }),
    logout: () => call('POST', '/api/auth/logout'),
    users: () => call('GET', '/api/users'),
    createUser: (u) => call('POST', '/api/users', u),
    updateUser: (id, u) => call('PUT', `/api/users/${id}`, u),
    backupStatus: () => call('GET', '/api/backup/status'),
    runBackup: () => call('POST', '/api/backup/run'),
    exportTables: () => call('GET', '/api/export'),
    settings: () => call('GET', '/api/settings'),
    saveSettings: (s) => call('PUT', '/api/settings', s),
    printers: () => call('GET', '/api/printers'),
};
