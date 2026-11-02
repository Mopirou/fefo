async function call(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
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
    stock: () => call('GET', '/api/stock'),
    lots: (productId) => call('GET', `/api/stock/lots?product_id=${productId}`),
    consume: (c) => call('POST', '/api/stock/consume', c),
    alerts: () => call('GET', '/api/alerts'),
    inventory: (counts) => call('POST', '/api/inventory', { counts }),
    recipes: () => call('GET', '/api/recipes'),
    recipe: (id) => call('GET', `/api/recipes/${id}`),
    saveRecipe: (r) => (r.id ? call('PUT', `/api/recipes/${r.id}`, r) : call('POST', '/api/recipes', r)),
    deleteRecipe: (id) => call('DELETE', `/api/recipes/${id}`),
    batches: () => call('GET', '/api/batches'),
    createBatch: (b) => call('POST', '/api/batches', b),
    freeze: (id) => call('POST', `/api/batches/${id}/freeze`),
    thaw: (id) => call('POST', `/api/batches/${id}/thaw`),
    printBatch: (id) => call('POST', `/api/batches/${id}/print`),
    settings: () => call('GET', '/api/settings'),
    saveSettings: (s) => call('PUT', '/api/settings', s),
    printers: () => call('GET', '/api/printers'),
};
