<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker.vue';

const emit = defineEmits(['unknown-ean']);
// Keep in sync with RECV_MAX in backend/services/stock.js.
const RECV_MAX = { positif_3: 3, positif_4: 4, positif_8: 8, surgele: -18 };
const REASONS = { temperature: 'Température trop haute', manuel: 'Refus manuel' };

const product = ref(null);
const form = ref({});
const message = ref('');
const refusedMsg = ref('');
const error = ref('');
const history = ref([]);

const blank = () => ({ qty: 1, dlc: '', lot_no: '', recv_temp: '', conform: true, note: '' });
const tooWarm = computed(() => {
    const max = RECV_MAX[product.value?.temp_class];
    const t = form.value.recv_temp;
    return max !== undefined && t !== '' && t !== null && Number(t) > max ? max : null;
});

function pick(p) { product.value = p; form.value = blank(); message.value = ''; refusedMsg.value = ''; error.value = ''; }
const fmt = (ts) => new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
async function loadHistory() { history.value = await api.refusedReceipts(); }

async function submit() {
    error.value = ''; message.value = ''; refusedMsg.value = '';
    try {
        const body = { ...form.value, product_id: product.value.id, recv_temp: form.value.recv_temp === '' ? null : form.value.recv_temp };
        const r = await api.receive(body);
        if (r.refused) refusedMsg.value = `⛔ ${product.value.name} : livraison refusée, non ajoutée au stock. ${r.warnings.join(' ')}`;
        else message.value = `Entrée enregistrée (lot ${r.lot.id}).`;
        product.value = null;
        await loadHistory();
    } catch (e) { error.value = e.message; }
}
onMounted(loadHistory);
</script>

<template>
    <main>
        <p v-if="message" class="ok">{{ message }}</p>
        <p v-if="refusedMsg" class="refused">{{ refusedMsg }}</p>
        <ProductPicker v-if="!product" @pick="pick" @unknown-ean="emit('unknown-ean', $event)" />
        <form v-else @submit.prevent="submit">
            <h3 class="full">{{ product.name }} <span class="muted">({{ product.unit }})</span></h3>
            <label>Quantité<input v-model.number="form.qty" type="number" step="any" min="0" required /></label>
            <label>DLC / DDM<input v-model="form.dlc" type="date" :required="product.temp_class !== 'ambiant'" /></label>
            <label>N° de lot<input v-model="form.lot_no" /></label>
            <label>Température à réception (°C)<input v-model="form.recv_temp" type="number" step="0.1" /></label>
            <p v-if="tooWarm !== null" class="refused full">⛔ {{ form.recv_temp }} °C pour un maximum de {{ tooWarm }} °C : la livraison sera REFUSÉE.</p>
            <label>Conforme<input v-model="form.conform" type="checkbox" /></label>
            <label class="full">Remarque<input v-model="form.note" /></label>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full">
                <button class="primary">{{ tooWarm !== null || !form.conform ? 'Enregistrer le refus' : "Enregistrer l'entrée" }}</button>
                <button type="button" @click="product = null">Annuler</button>
            </div>
        </form>

        <section v-if="!product">
            <h3>Livraisons refusées</h3>
            <p v-if="!history.length" class="muted">Aucune livraison refusée.</p>
            <div v-for="r in history" :key="r.lot_id" class="card">
                <div class="grow">
                    <strong>{{ r.name }}</strong> · {{ r.qty }} {{ r.unit }}
                    <div class="muted">
                        {{ fmt(r.received_at) }} · {{ REASONS[r.refusal_reason] || 'Refus' }}
                        <template v-if="r.recv_temp !== null"> · {{ r.recv_temp }} °C<template v-if="r.max_temp !== null"> (max {{ r.max_temp }} °C)</template></template>
                        <template v-if="r.lot_no"> · lot {{ r.lot_no }}</template>
                        <template v-if="r.note"> · {{ r.note }}</template>
                    </div>
                </div>
            </div>
        </section>
    </main>
</template>
