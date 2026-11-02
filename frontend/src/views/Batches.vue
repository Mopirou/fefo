<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const STATES = { fresh: 'Frais', frozen: 'Congelé', thawed: 'Décongelé' };
const recipes = ref([]);
const batches = ref([]);
const settings = ref({ prep_dlc_max_days: 3, printer: '' });
const form = ref(null);
const message = ref('');
const error = ref('');

const iso = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const needsJustification = computed(() => form.value && form.value.dlc > iso(settings.value.prep_dlc_max_days));

async function load() {
    [recipes.value, batches.value, settings.value] = await Promise.all([api.recipes(), api.batches(), api.settings()]);
}
function start() {
    error.value = ''; message.value = '';
    const r = recipes.value[0];
    form.value = { recipe_id: r?.id ?? '', qty: r?.yield_qty ?? 1, dlc: iso(r?.default_dlc_days ?? 3), justification: '', print: !!settings.value.printer };
}
function onRecipe() {
    const r = recipes.value.find(x => x.id === form.value.recipe_id);
    form.value.qty = r.yield_qty;
    form.value.dlc = iso(r.default_dlc_days);
}
async function create() {
    error.value = '';
    try {
        const r = await api.createBatch(form.value);
        message.value = `Lot ${r.batch.lot_no} créé.` + (r.print ? ' Étiquette imprimée.' : '') + (r.print_error ? ` ⚠ ${r.print_error}` : '');
        form.value = null;
        await load();
    } catch (e) { error.value = e.message; }
}
async function act(fn, b) {
    error.value = ''; message.value = '';
    try { await fn(b.id); await load(); } catch (e) { error.value = e.message; }
}
async function print(b) {
    error.value = ''; message.value = '';
    try { await api.printBatch(b.id); message.value = 'Étiquette envoyée à l\'imprimante.'; } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
    <main>
        <div class="bar"><button class="primary" :disabled="!recipes.length" @click="start">+ Fabriquer un lot</button>
            <span v-if="!recipes.length" class="muted">Créer d'abord une recette.</span></div>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="error" class="err">{{ error }}</div>

        <form v-if="form" @submit.prevent="create">
            <label class="full">Recette
                <select v-model="form.recipe_id" @change="onRecipe"><option v-for="r in recipes" :key="r.id" :value="r.id">{{ r.name }}</option></select>
            </label>
            <label>Quantité produite<input v-model.number="form.qty" type="number" step="any" min="0" required /></label>
            <label>DLC<input v-model="form.dlc" type="date" :min="iso(0)" required /></label>
            <label v-if="needsJustification" class="full">Justification (DLC au-delà de {{ settings.prep_dlc_max_days }} jours)
                <input v-model="form.justification" required /></label>
            <label>Imprimer l'étiquette<input v-model="form.print" type="checkbox" /></label>
            <div class="actions full"><button class="primary">Créer le lot</button><button type="button" @click="form = null">Annuler</button></div>
        </form>

        <div v-for="b in batches" :key="b.id" class="card">
            <div class="grow">
                <strong>{{ b.name }}</strong> <span class="muted">· {{ b.lot_no }}</span>
                <div class="muted">{{ STATES[b.state] }} · fabriqué le {{ b.made_at }} · DLC {{ b.current_dlc || '— (congelé)' }} · reste {{ b.stock_qty }} {{ b.unit }}</div>
            </div>
            <button v-if="b.state === 'fresh'" @click="act(api.freeze, b)">Congeler</button>
            <button v-if="b.state === 'frozen'" @click="act(api.thaw, b)">Décongeler</button>
            <button @click="print(b)">🖨</button>
            <a :href="`/api/batches/${b.id}/label.pdf`" target="_blank">PDF</a>
            <a :href="`/api/batches/${b.id}/trace.pdf`" target="_blank">Traçabilité</a>
        </div>
    </main>
</template>
