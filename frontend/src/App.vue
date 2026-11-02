<script setup>
import { ref } from 'vue';
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

const TABS = [
    ['stock', 'Stock', Stock], ['reception', 'Réception', Receiving], ['lots', 'Préparations', Batches],
    ['recettes', 'Recettes', Recipes], ['ventes', 'Ventes', Sales], ['pertes', 'Pertes', Losses],
    ['registres', 'Registres', Registers], ['bord', 'Tableau de bord', Dashboard], ['inventaire', 'Inventaire', Inventory],
    ['produits', 'Produits', Products], ['reglages', 'Réglages', Settings],
];
const tab = ref('stock');
const prefillEan = ref('');

// Unknown EAN scanned at reception: jump to a new product form with the EAN filled in.
function unknownEan(ean) { prefillEan.value = ean; tab.value = 'produits'; }
function go(key) { prefillEan.value = ''; tab.value = key; }
</script>

<template>
    <header>
        <h1>HACCP</h1>
        <button v-for="[key, label] in TABS" :key="key" :class="{ primary: tab === key }" @click="go(key)">{{ label }}</button>
    </header>
    <template v-for="[key, , view] in TABS" :key="key">
        <component :is="view" v-if="tab === key" :prefill-ean="key === 'produits' ? prefillEan : undefined" @unknown-ean="unknownEan" />
    </template>
</template>
