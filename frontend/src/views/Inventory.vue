<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../api';

const rows = ref([]);
const counted = ref({});
const result = ref(null);
const error = ref('');

async function load() { rows.value = await api.stock(); counted.value = {}; }
const entries = computed(() => rows.value
    .filter(r => counted.value[r.product_id] !== undefined && counted.value[r.product_id] !== '')
    .map(r => ({ ...r, counted: Number(counted.value[r.product_id]), gap: Number(counted.value[r.product_id]) - r.qty })));

async function apply() {
    error.value = '';
    try {
        result.value = await api.inventory(entries.value.map(e => ({ product_id: e.product_id, counted: e.counted })));
        await load();
    } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
    <main>
        <p class="muted">Saisir le stock réel des produits comptés ; l'écart avec le stock théorique est calculé puis appliqué.</p>
        <div v-for="r in rows" :key="r.product_id" class="card">
            <div class="grow"><strong>{{ r.name }}</strong><div class="muted">théorique : {{ r.qty }} {{ r.unit }}</div></div>
            <input v-model="counted[r.product_id]" type="number" step="any" min="0" placeholder="réel" style="width: 6rem" />
            <span v-if="counted[r.product_id] !== undefined && counted[r.product_id] !== ''" :class="{ danger: counted[r.product_id] - r.qty < 0 }" style="width: 4rem">
                {{ counted[r.product_id] - r.qty > 0 ? '+' : '' }}{{ counted[r.product_id] - r.qty }}
            </span>
        </div>
        <div v-if="error" class="err">{{ error }}</div>
        <p v-if="result" class="ok">Inventaire appliqué ({{ result.length }} produit(s)).</p>
        <button class="primary" :disabled="!entries.length" @click="apply">Appliquer l'inventaire ({{ entries.length }})</button>
    </main>
</template>
