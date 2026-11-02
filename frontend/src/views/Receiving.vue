<script setup>
import { ref } from 'vue';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker.vue';

const emit = defineEmits(['unknown-ean']);
const product = ref(null);
const form = ref({});
const message = ref('');
const error = ref('');

const blank = () => ({ qty: 1, dlc: '', lot_no: '', recv_temp: '', conform: true, note: '' });
function pick(p) { product.value = p; form.value = blank(); message.value = ''; error.value = ''; }

async function submit() {
    error.value = '';
    try {
        const body = { ...form.value, product_id: product.value.id, recv_temp: form.value.recv_temp === '' ? null : form.value.recv_temp };
        const r = await api.receive(body);
        message.value = `Entrée enregistrée (lot ${r.lot.id}).` + (r.warnings.length ? ' ⚠ ' + r.warnings.join(' ') : '');
        product.value = null;
    } catch (e) { error.value = e.message; }
}
</script>

<template>
    <main>
        <p v-if="message" class="ok">{{ message }}</p>
        <ProductPicker v-if="!product" @pick="pick" @unknown-ean="emit('unknown-ean', $event)" />
        <form v-else @submit.prevent="submit">
            <h3 class="full">{{ product.name }} <span class="muted">({{ product.unit }})</span></h3>
            <label>Quantité<input v-model.number="form.qty" type="number" step="any" min="0" required /></label>
            <label>DLC / DDM<input v-model="form.dlc" type="date" :required="product.temp_class !== 'ambiant'" /></label>
            <label>N° de lot<input v-model="form.lot_no" /></label>
            <label>Température à réception (°C)<input v-model="form.recv_temp" type="number" step="0.1" /></label>
            <label>Conforme<input v-model="form.conform" type="checkbox" /></label>
            <label class="full">Remarque<input v-model="form.note" /></label>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full">
                <button class="primary">Enregistrer l'entrée</button>
                <button type="button" @click="product = null">Annuler</button>
            </div>
        </form>
    </main>
</template>
