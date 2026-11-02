<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const LABELS = { dlc_depassee: 'DLC dépassée', casse: 'Casse', erreur_preparation: 'Erreur de préparation', non_conformite_reception: 'Non-conformité à réception' };
const d = ref(null);
const from = ref('');
const to = ref('');
const error = ref('');

const eur = (n) => (n ?? 0).toFixed(2) + ' €';
const pct = (n) => (n === null || n === undefined ? '—' : n.toFixed(1) + ' %');

async function load() {
    error.value = '';
    try {
        d.value = await api.dashboard({ ...(from.value && { from: from.value }), ...(to.value && { to: to.value }) });
        from.value = d.value.from; to.value = d.value.to;
    } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
    <main>
        <div class="bar">
            <label>Du <input v-model="from" type="date" /></label>
            <label>Au <input v-model="to" type="date" /></label>
            <button class="primary" @click="load">Afficher</button>
        </div>
        <div v-if="error" class="err">{{ error }}</div>
        <template v-if="d">
            <div class="kpis">
                <div class="kpi"><span>Valeur du stock</span><strong>{{ eur(d.stock_value) }}</strong></div>
                <div class="kpi"><span>Chiffre d'affaires HT</span><strong>{{ eur(d.revenue) }}</strong></div>
                <div class="kpi"><span>Coût matière</span><strong>{{ eur(d.cogs) }}</strong></div>
                <div class="kpi"><span>Marge brute</span><strong>{{ eur(d.gross_margin) }}</strong><small>{{ pct(d.gross_margin_pct) }}</small></div>
                <div class="kpi"><span>Pertes</span><strong class="danger">{{ eur(d.losses_total) }}</strong><small>{{ pct(d.losses_pct_of_revenue) }} du CA</small></div>
                <div class="kpi"><span>Profit (marge − pertes)</span><strong>{{ eur(d.profit) }}</strong></div>
            </div>

            <h3>Pertes par motif</h3>
            <div v-for="l in d.losses_by_reason" :key="l.reason" class="card"><div class="grow">{{ LABELS[l.reason] }}</div>{{ eur(l.cost) }}</div>
            <p v-if="!d.losses_by_reason.length" class="muted">Aucune perte sur la période.</p>

            <h3>Coût matière par recette</h3>
            <div v-for="r in d.recipes" :key="r.recipe_id" class="card">
                <div class="grow"><strong>{{ r.name }}</strong><div class="muted">coût {{ eur(r.unit_cost) }} · vente {{ eur(r.sell_ht) }}</div></div>
                <span>{{ eur(r.margin) }} ({{ pct(r.margin_pct) }})</span>
            </div>
            <p v-if="!d.recipes.length" class="muted">Aucune recette.</p>

            <h3>Boissons</h3>
            <div v-for="b in d.drinks" :key="b.product_id" class="card">
                <div class="grow"><strong>{{ b.name }}</strong><div class="muted">achat {{ eur(b.unit_cost) }} · vente {{ eur(b.sell_ht) }}</div></div>
                <span>{{ eur(b.margin) }} ({{ pct(b.margin_pct) }})</span>
            </div>
            <p v-if="!d.drinks.length" class="muted">Aucune boisson.</p>
        </template>
    </main>
</template>

<style scoped>
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .6rem; margin-bottom: 1rem; }
.kpi { background: #fff; border: 1px solid var(--bd); border-radius: 10px; padding: .7rem; display: flex; flex-direction: column; }
.kpi span { font-size: .8rem; color: #64748b; }
.kpi strong { font-size: 1.2rem; }
.kpi small { color: #64748b; }
</style>
