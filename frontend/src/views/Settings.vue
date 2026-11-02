<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const s = ref(null);
const printers = ref([]);
const message = ref('');
const error = ref('');

async function save() {
    error.value = ''; message.value = '';
    try { s.value = await api.saveSettings(s.value); message.value = 'Réglages enregistrés.'; }
    catch (e) { error.value = e.message; }
}
onMounted(async () => {
    s.value = await api.settings();
    printers.value = await api.printers().catch(() => []);
});
</script>

<template>
    <main>
        <form v-if="s" @submit.prevent="save">
            <label class="full">Imprimante d'étiquettes
                <select v-model="s.printer">
                    <option value="">— aucune —</option>
                    <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
                </select>
            </label>
            <label>DLC max d'une préparation (jours)<input v-model.number="s.prep_dlc_max_days" type="number" min="1" max="30" /></label>
            <label>DLC après décongélation (heures, max 48)<input v-model.number="s.thaw_dlc_hours" type="number" min="1" max="48" /></label>
            <p class="muted full">Valeurs par défaut du cahier des charges : 3 jours, 24 h. À aligner sur le plan de maîtrise sanitaire.</p>
            <div v-if="error" class="err">{{ error }}</div>
            <p v-if="message" class="ok full">{{ message }}</p>
            <div class="actions full"><button class="primary">Enregistrer</button></div>
        </form>
    </main>
</template>
