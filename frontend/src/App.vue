<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api } from './api';
import Products from './views/Products.vue';
import Receiving from './views/Receiving.vue';
import Stock from './views/Stock.vue';
import Inventory from './views/Inventory.vue';
import Batches from './views/Batches.vue';
import Recipes from './views/Recipes.vue';
import Settings from './views/Settings.vue';
import Sales from './views/Sales.vue';
import Losses from './views/Losses.vue';
import Dashboard from './views/Dashboard.vue';
import Registers from './views/Registers.vue';
import Login from './views/Login.vue';

const TABS = [
    ['stock', 'Stock', Stock], ['reception', 'Réception', Receiving], ['lots', 'Préparations', Batches],
    ['recettes', 'Recettes', Recipes], ['ventes', 'Ventes', Sales], ['pertes', 'Pertes', Losses],
    ['registres', 'Registres', Registers], ['bord', 'Tableau de bord', Dashboard], ['inventaire', 'Inventaire', Inventory],
    ['produits', 'Produits', Products], ['reglages', 'Réglages', Settings],
];
const tab = ref('stock');
const prefillEan = ref('');
const session = ref({ ready: false, required: false, user: null, users: [] });

// Unknown EAN scanned at reception: jump to a new product form with the EAN filled in.
function unknownEan(ean) { prefillEan.value = ean; tab.value = 'produits'; }
function go(key) { prefillEan.value = ''; tab.value = key; }

async function refresh() {
    const s = await api.authStatus();
    session.value = { ready: true, required: s.auth_required, user: s.user, users: s.users };
}
async function logout() { await api.logout(); await refresh(); }

// Any 401 (expired session, account disabled) sends the user back to the login screen.
const onAuthRequired = () => refresh();
onMounted(() => { refresh(); window.addEventListener('auth-required', onAuthRequired); });
onBeforeUnmount(() => window.removeEventListener('auth-required', onAuthRequired));
</script>

<template>
    <template v-if="session.ready">
        <header v-if="!session.required || session.user">
            <h1>HACCP</h1>
            <button v-for="[key, label] in TABS" :key="key" :class="{ primary: tab === key }" @click="go(key)">{{ label }}</button>
            <button v-if="session.user" @click="logout">{{ session.user.name }} ⎋</button>
        </header>
        <Login v-if="session.required && !session.user" :users="session.users" @done="refresh" />
        <template v-else>
            <template v-for="[key, , view] in TABS" :key="key">
                <component :is="view" v-if="tab === key" :prefill-ean="key === 'produits' ? prefillEan : undefined"
                    @unknown-ean="unknownEan" @session-changed="refresh" />
            </template>
        </template>
    </template>
</template>
