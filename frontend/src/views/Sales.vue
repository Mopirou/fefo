<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const products = ref([]);
const q = ref('');
const qty = ref({});
const date = ref(today());
const message = ref('');
const error = ref('');
const csv = ref('');
const importErrors = ref([]);

const shown = computed(() => products.value.filter(p => !q.value || p.name.toLowerCase().includes(q.value.toLowerCase())));
const lines = computed(() => Object.entries(qty.value).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ product_id: Number(id), qty: Number(v) })));

const report = (r) => {
    const short = r.shortfalls?.length ? ` ⚠ Stock insuffisant: ${r.shortfalls.map(s => `${s.name} (-${s.shortfall})`).join(', ')}` : '';
    return short;
};

async function save() {
    error.value = ''; message.value = '';
    try {
        const r = await api.createSales({ date: date.value, lines: lines.value });
        message.value = `${r.sales.length} vente(s) enregistrée(s).` + report(r);
        qty.value = {};
    } catch (e) { error.value = e.message; }
}
async function loadFile(e) {
    const f = e.target.files[0];
    if (f) csv.value = await f.text();
}
async function importCsv() {
    error.value = ''; message.value = ''; importErrors.value = [];
    try {
        const r = await api.importSales({ csv: csv.value, date: date.value });
        if (r.errors.length) { importErrors.value = r.errors; return; }
        message.value = `${r.imported} ligne(s) importée(s).` + report(r);
        csv.value = '';
    } catch (e) { error.value = e.message; }
}
onMounted(async () => { products.value = await api.listProducts(); });
</script>

<template>
    <main>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="error" class="err">{{ error }}</div>

        <h3>Saisie de fin de service</h3>
        <div class="bar">
            <label>Date <input v-model="date" type="date" /></label>
            <input v-model="q" type="search" placeholder="Filtrer les produits" />
        </div>
        <div v-for="p in shown" :key="p.id" class="card">
            <div class="grow"><strong>{{ p.name }}</strong><div class="muted">{{ p.sell_ht.toFixed(2) }} € HT</div></div>
            <input v-model="qty[p.id]" type="number" min="0" step="any" placeholder="0" style="width: 5.5rem" />
        </div>
        <button class="primary" :disabled="!lines.length" @click="save">Enregistrer {{ lines.length }} ligne(s)</button>

        <h3>Import CSV de la caisse</h3>
        <p class="muted">Colonnes reconnues : produit (nom ou EAN), quantité, prix (facultatif), date (facultatif, sinon la date ci-dessus). Tout ou rien : une ligne en erreur bloque l'import.</p>
        <input type="file" accept=".csv,text/csv,text/plain" @change="loadFile" />
        <textarea v-model="csv" rows="5" placeholder="ou coller le CSV ici" style="width: 100%; margin-top: .5rem"></textarea>
        <ul v-if="importErrors.length" class="err">
            <li v-for="e in importErrors" :key="e.line">Ligne {{ e.line }} : {{ e.message }}</li>
        </ul>
        <button class="primary" :disabled="!csv" @click="importCsv">Importer</button>
    </main>
</template>
