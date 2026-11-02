<script setup>
// Pick a product by scan, search, or one of the favorite buttons (top 20).
import { ref, onMounted, watch } from 'vue';
import { api } from '../api';
import Scanner from './Scanner.vue';

const emit = defineEmits(['pick', 'unknown-ean']);
const favorites = ref([]);
const results = ref([]);
const q = ref('');

onMounted(async () => { favorites.value = (await api.listProducts({ favorite: 1 })).slice(0, 20); });
watch(q, async (v) => { results.value = v.length >= 2 ? await api.listProducts({ q: v }) : []; });

async function onScan(code) {
    try { emit('pick', await api.productByEan(code)); }
    catch { emit('unknown-ean', code); }
}
const pick = (p) => { q.value = ''; results.value = []; emit('pick', p); };
</script>

<template>
    <div class="picker">
        <div class="bar">
            <Scanner @scan="onScan" />
            <input v-model="q" type="search" placeholder="Rechercher un produit" />
        </div>
        <div v-for="p in results" :key="p.id" class="card" @click="pick(p)">{{ p.name }}</div>
        <div v-if="!q" class="favs">
            <button v-for="p in favorites" :key="p.id" type="button" @click="pick(p)">★ {{ p.name }}</button>
        </div>
    </div>
</template>

<style scoped>
.favs { display: flex; flex-wrap: wrap; gap: .4rem; }
.favs button { min-height: 44px; }
</style>
