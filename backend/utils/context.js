const { AsyncLocalStorage } = require('async_hooks');

// Logged-in user of the request being handled; read by the SQL function current_user_id().
const store = new AsyncLocalStorage();

const runAs = (userId, fn) => store.run({ userId }, fn);
const currentUserId = () => store.getStore()?.userId ?? null;

module.exports = { runAs, currentUserId };
