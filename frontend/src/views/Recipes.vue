<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const recipes = ref([]);
const products = ref([]);
// One choice per article: the cook picks the actual reference (Aldi, Metro...) at manufacture time.
const ingredientChoices = computed(() => {
    const seen = new Map();
    for (const p of products.value) {
        const key = p.article_id ? `a${p.article_id}` : `p${p.id}`;
        if (!seen.has(key)) seen.set(key, { id: p.id, label: p.article || p.name, unit: p.unit, key });
    }
    return [...seen.values()];
});
const repOf = (productId) => {
    const p = products.value.find(x => x.id === productId);
    return p?.article_id ? products.value.find(x => x.article_id === p.article_id).id : productId;
};
const editing = ref(null);
const error = ref('');

const blank = () => ({ name: '', unit: 'portion', yield_qty: 1, default_dlc_days: 3, items: [{ product_id: '', qty: 1 }] });

async function load() { recipes.value = await api.recipes(); }
async function edit(r) {
    error.value = '';
    editing.value = r ? await api.recipe(r.id) : blank();
    for (const it of editing.value.items) it.product_id = repOf(it.product_id);
}
async function save() {
    error.value = '';
    try {
        await api.saveRecipe(editing.value);
        editing.value = null;
        await load();
    } catch (e) { error.value = e.message; }
}
async function remove() {
    if (!confirm('Supprimer cette recette ?')) return;
    try { await api.deleteRecipe(editing.value.id); editing.value = null; await load(); }
    catch (e) { error.value = e.message; }
}
onMounted(async () => { products.value = await api.listProducts(); load(); });
</script>

<template>
    <main>
        <div class="bar"><button class="primary" @click="edit()">+ Recette</button></div>
        <form v-if="editing" @submit.prevent="save">
            <label class="full">Nom<input v-model="editing.name" required /></label>
            <label>Rendement<input v-model.number="editing.yield_qty" type="number" step="any" min="0" required /></label>
            <label v-if="!editing.id">Unité du produit fini<input v-model="editing.unit" /></label>
            <label>DLC par défaut (jours)<input v-model.number="editing.default_dlc_days" type="number" min="0" /></label>
            <h4 class="full">Ingrédients (pour le rendement ci-dessus)</h4>
            <div v-for="(it, i) in editing.items" :key="i" class="full row">
                <select v-model="it.product_id" required>
                    <option value="" disabled>Produit…</option>
                    <option v-for="c in ingredientChoices" :key="c.key" :value="c.id">{{ c.label }} ({{ c.unit }})</option>
                </select>
                <input v-model.number="it.qty" type="number" step="any" min="0" required style="width: 6rem" />
                <button type="button" @click="editing.items.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="full" @click="editing.items.push({ product_id: '', qty: 1 })">+ Ingrédient</button>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full">
                <button class="primary">Enregistrer</button>
                <button type="button" @click="editing = null">Annuler</button>
                <button v-if="editing.id" type="button" class="danger" @click="remove">Supprimer</button>
            </div>
        </form>
        <div v-for="r in recipes" :key="r.id" class="card" @click="edit(r)">
            <div class="grow"><strong>{{ r.name }}</strong><div class="muted">rendement {{ r.yield_qty }} · DLC {{ r.default_dlc_days }} j</div></div>
        </div>
        <p v-if="!recipes.length" class="muted">Aucune recette.</p>
    </main>
</template>

<style scoped>
.row { display: flex; gap: .4rem; }
.row select { flex: 1; }
</style>
