<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker.vue';

const LABELS = {
    dlc_depassee: 'DLC dépassée',
    casse: 'Casse',
    erreur_preparation: 'Erreur de préparation',
    non_conformite_reception: 'Non-conformité à réception',
};
const product = ref(null);
const lots = ref([]);
const form = ref({ qty: 1, reason: 'dlc_depassee', lot_id: '', note: '' });
const losses = ref([]);
const message = ref('');
const error = ref('');

async function pick(p) {
    product.value = p;
    form.value = { qty: 1, reason: 'dlc_depassee', lot_id: '', note: '' };
    lots.value = await api.lots(p.id);
}
async function save() {
    error.value = ''; message.value = '';
    try {
        const body = { ...form.value, product_id: product.value.id, lot_id: form.value.lot_id || undefined };
        const r = await api.createLoss(body);
        message.value = `Perte enregistrée : ${r.cost_ht.toFixed(2)} € HT.`;
        product.value = null;
        losses.value = await api.losses();
    } catch (e) { error.value = e.message; }
}
onMounted(async () => { losses.value = (await api.losses()).slice(0, 30); });
</script>

<template>
    <main>
        <p v-if="message" class="ok">{{ message }}</p>
        <ProductPicker v-if="!product" @pick="pick" />
        <form v-else @submit.prevent="save">
            <h3 class="full">{{ product.name }}</h3>
            <label>Quantité perdue<input v-model.number="form.qty" type="number" step="any" min="0" required /></label>
            <label>Motif
                <select v-model="form.reason"><option v-for="(l, k) in LABELS" :key="k" :value="k">{{ l }}</option></select>
            </label>
            <label class="full">Lot concerné (sinon sortie FEFO)
                <select v-model="form.lot_id">
                    <option value="">Automatique (FEFO)</option>
                    <option v-for="l in lots" :key="l.id" :value="l.id">lot {{ l.lot_no || l.id }} · DLC {{ l.dlc || '—' }} · {{ l.qty }}</option>
                </select>
            </label>
            <label class="full">Remarque<input v-model="form.note" /></label>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full"><button class="primary">Enregistrer la perte</button><button type="button" @click="product = null">Annuler</button></div>
        </form>

        <h3>Dernières pertes</h3>
        <div v-for="l in losses" :key="l.id" class="card">
            <div class="grow"><strong>{{ l.name }}</strong> × {{ l.qty }}<div class="muted">{{ l.day }} · {{ LABELS[l.reason] }}</div></div>
            <span class="danger">{{ l.cost_ht.toFixed(2) }} €</span>
        </div>
        <p v-if="!losses.length" class="muted">Aucune perte.</p>
    </main>
</template>
