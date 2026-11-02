<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '../api';

// An EAN scanned elsewhere that matched no product: open the form prefilled with it.
const props = defineProps({ prefillEan: { type: String, default: '' } });

const CATEGORIES = [['boisson', 'Boisson'], ['ingredient', 'Ingrédient'], ['consommable', 'Consommable']];
const TEMPS = [['ambiant', 'Ambiant'], ['positif_3', '0 à +3 °C'], ['positif_4', '+4 °C max'], ['positif_8', '+8 °C max'], ['surgele', 'Surgelé -18 °C']];
const empty = () => ({ name: '', category: 'boisson', unit: 'unite', ean: '', article: '', supplier: '', buy_ht: 0, sell_ht: 0, allergens: '', temp_class: 'ambiant', favorite: false, min_stock: 0 });

const products = ref([]);
const articles = ref([]);
const q = ref('');
const onlyFav = ref(false);
const editing = ref(null);
const error = ref('');

async function load() {
    products.value = await api.listProducts({ ...(q.value && { q: q.value }), ...(onlyFav.value && { favorite: 1 }) });
    articles.value = [...new Set((await api.listProducts()).map(p => p.article).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
async function save() {
    error.value = '';
    try {
        const p = editing.value;
        p.id ? await api.updateProduct(p.id, p) : await api.createProduct(p);
        editing.value = null;
        await load();
    } catch (e) { error.value = e.message; }
}
async function remove() {
    if (!confirm('Supprimer ce produit ?')) return;
    await api.deleteProduct(editing.value.id);
    editing.value = null;
    await load();
}
async function toggleFav(p) {
    await api.updateProduct(p.id, { ...p, favorite: !p.favorite });
    await load();
}
const open = (p) => { error.value = ''; editing.value = p ? { ...p, favorite: !!p.favorite } : empty(); };

watch([q, onlyFav], load);
onMounted(() => {
    load();
    if (props.prefillEan) open({ ...empty(), ean: props.prefillEan });
});
</script>

<template>
    <main>
        <div class="bar"><button class="primary" @click="open()">+ Produit</button></div>
        <form v-if="editing" @submit.prevent="save">
            <label class="full">Nom<input v-model="editing.name" required /></label>
            <label class="full">Article (famille, ex. « Citron »)
                <input v-model="editing.article" list="articles" placeholder="Laisser vide si le produit est unique" />
                <datalist id="articles"><option v-for="a in articles" :key="a" :value="a" /></datalist>
            </label>
            <label>Catégorie<select v-model="editing.category"><option v-for="[v, l] in CATEGORIES" :key="v" :value="v">{{ l }}</option></select></label>
            <label>Unité<input v-model="editing.unit" /></label>
            <label>EAN (facultatif)<input v-model="editing.ean" inputmode="numeric" /></label>
            <label>Fournisseur<input v-model="editing.supplier" /></label>
            <label>Prix d'achat HT<input v-model.number="editing.buy_ht" type="number" step="0.01" min="0" /></label>
            <label>Prix de vente HT<input v-model.number="editing.sell_ht" type="number" step="0.01" min="0" /></label>
            <label>Allergènes<input v-model="editing.allergens" /></label>
            <label>Température<select v-model="editing.temp_class"><option v-for="[v, l] in TEMPS" :key="v" :value="v">{{ l }}</option></select></label>
            <label>Seuil de stock bas<input v-model.number="editing.min_stock" type="number" step="any" min="0" /></label>
            <label>Favori<input v-model="editing.favorite" type="checkbox" /></label>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full">
                <button class="primary">Enregistrer</button>
                <button type="button" @click="editing = null">Annuler</button>
                <button v-if="editing.id" type="button" class="danger" @click="remove">Supprimer</button>
            </div>
        </form>

        <div class="bar">
            <input v-model="q" type="search" placeholder="Rechercher un produit ou un EAN" />
            <label><input v-model="onlyFav" type="checkbox" /> Favoris</label>
        </div>

        <div v-for="p in products" :key="p.id" class="card" @click="open(p)">
            <button class="star" @click.stop="toggleFav(p)">{{ p.favorite ? '★' : '☆' }}</button>
            <div class="grow">
                <strong>{{ p.name }}</strong>
                <div class="muted"><span v-if="p.article">{{ p.article }} · </span>{{ p.category }} · {{ p.unit }}<span v-if="p.supplier"> · {{ p.supplier }}</span><span v-if="p.ean"> · {{ p.ean }}</span></div>
            </div>
            <div class="muted">{{ p.sell_ht.toFixed(2) }} € HT</div>
        </div>
        <p v-if="!products.length" class="muted">Aucun produit.</p>
    </main>
</template>
