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
};
