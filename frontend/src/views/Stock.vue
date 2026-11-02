<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const rows = ref([]);
const alerts = ref({ low_stock: [], dlc_expired: [], dlc_today: [], dlc_tomorrow: [] });
const open = ref(null);
const lots = ref([]);

async function load() {
    [rows.value, alerts.value] = await Promise.all([api.stock(), api.alerts()]);
}
async function toggle(r) {
    if (open.value === r.product_id) { open.value = null; return; }
    open.value = r.product_id;
    lots.value = await api.lots(r.product_id);
}
onMounted(load);
</script>

<template>
    <main>
        <div v-if="alerts.dlc_expired.length" class="alert bad">
            <strong>Périmés encore en stock</strong>
            <div v-for="l in alerts.dlc_expired" :key="l.lot_id">{{ l.name }} · lot {{ l.lot_no || l.lot_id }} · DLC {{ l.dlc }} · {{ l.qty }}</div>
        </div>
        <div v-if="alerts.dlc_today.length" class="alert warn">
            <strong>DLC aujourd'hui</strong>
            <div v-for="l in alerts.dlc_today" :key="l.lot_id">{{ l.name }} · lot {{ l.lot_no || l.lot_id }} · {{ l.qty }}</div>
        </div>
        <div v-if="alerts.dlc_tomorrow.length" class="alert warn">
            <strong>DLC demain</strong>
            <div v-for="l in alerts.dlc_tomorrow" :key="l.lot_id">{{ l.name }} · lot {{ l.lot_no || l.lot_id }} · {{ l.qty }}</div>
        </div>
        <div v-if="alerts.low_stock.length" class="alert warn">
            <strong>Stock bas</strong>
            <div v-for="s in alerts.low_stock" :key="s.product_id">{{ s.name }} : {{ s.qty }} (seuil {{ s.min_stock }})</div>
        </div>

        <div v-for="r in rows" :key="r.product_id">
            <div class="card" @click="toggle(r)">
                <div class="grow"><strong>{{ r.name }}</strong><div class="muted"><span v-if="r.article && r.article !== r.name">{{ r.article }} · </span><span v-if="r.supplier">{{ r.supplier }} · </span>prochaine DLC : {{ r.next_dlc || '—' }}</div></div>
                <strong>{{ r.qty }} {{ r.unit }}</strong>
            </div>
            <div v-if="open === r.product_id" class="lots">
                <div v-for="l in lots" :key="l.id" class="muted">lot {{ l.lot_no || l.id }} · DLC {{ l.dlc || '—' }} · {{ l.qty }}{{ l.conform ? '' : ' · NON CONFORME' }} · <a :href="`/api/lots/${l.id}/trace.pdf`" target="_blank">traçabilité</a></div>
                <div v-if="!lots.length" class="muted">Aucun lot en stock.</div>
            </div>
        </div>
    </main>
</template>

<style scoped>
.alert { border-radius: 10px; padding: .6rem .9rem; margin-bottom: .6rem; font-size: .9rem; }
.bad { background: #fee2e2; border: 1px solid #fca5a5; }
.warn { background: #fef3c7; border: 1px solid #fcd34d; }
.lots { padding: 0 1rem .6rem; }
</style>
