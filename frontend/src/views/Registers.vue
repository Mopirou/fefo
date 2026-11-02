<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const KINDS = { preparations: 'Préparations à l\'avance (0 à +3 °C)', tres_perissable: 'Denrées très périssables (+4 °C)', perissable: 'Denrées périssables (+8 °C)', surgele: 'Surgelés (-18 °C)' };
const FREQ = { quotidien: 'Quotidien', hebdomadaire: 'Hebdomadaire', mensuel: 'Mensuel' };

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoTime = (d = new Date()) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const view = ref('jour');
const day = ref(isoDay());
const todo = ref(null);
const fridges = ref([]);
const readings = ref([]);
const coolings = ref([]);
const tasks = ref([]);
const message = ref('');
const error = ref('');

const reading = ref({ fridge_id: '', slot: new Date().getHours() < 14 ? 'matin' : 'soir', value: '', action: '' });
const cooling = ref({ label: '', start_at: isoTime(), start_temp: 63, end_at: isoTime(), end_temp: 10, action: '' });
const fridgeForm = ref(null);
const taskForm = ref(null);
const report = ref({ from: isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: isoDay() });

async function load() {
    [todo.value, fridges.value, readings.value, coolings.value, tasks.value] = await Promise.all([
        api.todo(day.value), api.fridges(), api.temperatures({ from: day.value, to: day.value }),
        api.cooling({ from: day.value, to: day.value }), api.cleaning(day.value),
    ]);
}
async function run(fn, ok) {
    error.value = ''; message.value = '';
    try { const r = await fn(); if (ok) message.value = typeof ok === 'function' ? ok(r) : ok; await load(); return r; }
    catch (e) { error.value = e.message; }
}
const addReading = () => run(async () => {
    const r = await api.addReading({ ...reading.value, day: day.value });
    reading.value.value = ''; reading.value.action = '';
    return r;
}, (r) => (r.alert ? `⚠ ALERTE : ${r.value} °C au-dessus du seuil de ${r.max_temp} °C. Renseigner l'action corrective.` : 'Relevé enregistré.'));
const addCooling = () => run(() => api.addCooling(cooling.value), (r) => (r.alert ? `⚠ ALERTE : ${r.minutes} min, ${r.end_temp} °C à la fin.` : `Refroidissement conforme (${r.minutes} min).`));
const toggleTask = (t) => run(() => api.checkTask(t.id, day.value, !t.done));
const fixAction = (kind, row) => {
    const action = prompt('Action corrective menée :');
    if (action) run(() => (kind === 'temp' ? api.readingAction : api.coolingAction)(row.id, action), 'Action enregistrée.');
};
async function saveFridge() {
    await run(() => api.saveFridge(fridgeForm.value), 'Enceinte enregistrée.');
    if (!error.value) fridgeForm.value = null;
}
async function saveTask() {
    await run(() => api.saveTask(taskForm.value), 'Tâche enregistrée.');
    if (!error.value) taskForm.value = null;
}
const reportUrl = () => `/api/haccp/report.pdf?from=${report.value.from}&to=${report.value.to}`;
onMounted(load);
</script>

<template>
    <main>
        <div class="bar">
            <button :class="{ primary: view === 'jour' }" @click="view = 'jour'">Relevés du jour</button>
            <button :class="{ primary: view === 'enceintes' }" @click="view = 'enceintes'">Enceintes & nettoyage</button>
            <button :class="{ primary: view === 'export' }" @click="view = 'export'">Export PDF</button>
        </div>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="error" class="err">{{ error }}</div>

        <template v-if="view === 'jour' && todo">
            <div class="bar"><label>Jour <input v-model="day" type="date" @change="load" /></label></div>

            <div v-if="todo.open_alerts.readings.length || todo.open_alerts.cooling.length" class="alert bad">
                <strong>Alertes sans action corrective</strong>
                <div v-for="r in todo.open_alerts.readings" :key="'t' + r.id">
                    {{ r.day }} · {{ r.fridge_name }} · {{ r.value }} °C (seuil {{ r.max_temp }}) <button @click="fixAction('temp', r)">Renseigner</button>
                </div>
                <div v-for="c in todo.open_alerts.cooling" :key="'c' + c.id">
                    {{ c.day }} · {{ c.label }} · {{ c.minutes }} min / {{ c.end_temp }} °C <button @click="fixAction('cool', c)">Renseigner</button>
                </div>
            </div>
            <div v-if="todo.missing_readings.length" class="alert warn">
                <strong>Relevés manquants</strong>
                <div>{{ todo.missing_readings.map(m => `${m.fridge_name} (${m.slot})`).join(' · ') }}</div>
            </div>

            <h3>Températures des enceintes</h3>
            <form v-if="fridges.length" @submit.prevent="addReading">
                <label>Enceinte<select v-model="reading.fridge_id" required><option value="" disabled>Choisir…</option><option v-for="f in fridges" :key="f.id" :value="f.id">{{ f.name }} (max {{ f.max_temp }} °C)</option></select></label>
                <label>Créneau<select v-model="reading.slot"><option value="matin">Matin</option><option value="soir">Soir</option></select></label>
                <label>Température (°C)<input v-model="reading.value" type="number" step="0.1" required /></label>
                <label>Action corrective (si alerte)<input v-model="reading.action" /></label>
                <div class="actions full"><button class="primary">Enregistrer le relevé</button></div>
            </form>
            <p v-else class="muted">Ajouter d'abord une enceinte (onglet « Enceintes & nettoyage »).</p>
            <div v-for="r in readings" :key="r.id" class="card">
                <div class="grow"><strong>{{ r.fridge_name }}</strong> · {{ r.slot }}<div class="muted">{{ r.action || '' }}</div></div>
                <span :class="{ danger: r.alert }">{{ r.value }} °C {{ r.alert ? '⚠' : '✓' }}</span>
            </div>

            <h3>Refroidissement rapide</h3>
            <form @submit.prevent="addCooling">
                <label class="full">Préparation<input v-model="cooling.label" required /></label>
                <label>Début<input v-model="cooling.start_at" type="datetime-local" required /></label>
                <label>Temp. début (°C)<input v-model.number="cooling.start_temp" type="number" step="0.1" required /></label>
                <label>Fin<input v-model="cooling.end_at" type="datetime-local" required /></label>
                <label>Temp. fin (°C)<input v-model.number="cooling.end_temp" type="number" step="0.1" required /></label>
                <label class="full">Action corrective (si alerte)<input v-model="cooling.action" /></label>
                <div class="actions full"><button class="primary">Enregistrer</button></div>
            </form>
            <div v-for="c in coolings" :key="c.id" class="card">
                <div class="grow"><strong>{{ c.label }}</strong><div class="muted">{{ c.start_at.slice(11) }} → {{ c.end_at.slice(11) }} · {{ c.minutes }} min</div></div>
                <span :class="{ danger: c.alert }">{{ c.end_temp }} °C {{ c.alert ? '⚠' : '✓' }}</span>
            </div>

            <h3>Plan de nettoyage</h3>
            <div v-for="t in tasks" :key="t.id" class="card" @click="toggleTask(t)">
                <input type="checkbox" :checked="t.done" @click.prevent />
                <div class="grow">{{ t.name }}<div class="muted">{{ FREQ[t.frequency] }}<span v-if="t.done && t.done_on !== day"> · fait le {{ t.done_on }}</span></div></div>
            </div>
            <p v-if="!tasks.length" class="muted">Aucune tâche : en ajouter dans « Enceintes & nettoyage ».</p>
        </template>

        <template v-if="view === 'enceintes'">
            <h3>Enceintes froides</h3>
            <button class="primary" @click="fridgeForm = { name: '', kind: 'preparations', max_temp: '', contents: '' }">+ Enceinte</button>
            <form v-if="fridgeForm" @submit.prevent="saveFridge">
                <label>Nom<input v-model="fridgeForm.name" required /></label>
                <label>Type<select v-model="fridgeForm.kind"><option v-for="(l, k) in KINDS" :key="k" :value="k">{{ l }}</option></select></label>
                <label>Seuil max (°C), vide = défaut du type<input v-model="fridgeForm.max_temp" type="number" step="0.1" /></label>
                <label>Contenu<input v-model="fridgeForm.contents" /></label>
                <div class="actions full"><button class="primary">Enregistrer</button><button type="button" @click="fridgeForm = null">Annuler</button></div>
            </form>
            <div v-for="f in fridges" :key="f.id" class="card" @click="fridgeForm = { ...f }">
                <div class="grow"><strong>{{ f.name }}</strong><div class="muted">{{ KINDS[f.kind] }} · {{ f.contents }}</div></div>
                <span>max {{ f.max_temp }} °C</span>
            </div>

            <h3>Plan de nettoyage</h3>
            <button class="primary" @click="taskForm = { name: '', frequency: 'quotidien' }">+ Tâche</button>
            <form v-if="taskForm" @submit.prevent="saveTask">
                <label>Tâche<input v-model="taskForm.name" required /></label>
                <label>Fréquence<select v-model="taskForm.frequency"><option v-for="(l, k) in FREQ" :key="k" :value="k">{{ l }}</option></select></label>
                <div class="actions full">
                    <button class="primary">Enregistrer</button><button type="button" @click="taskForm = null">Annuler</button>
                    <button v-if="taskForm.id" type="button" class="danger" @click="taskForm.active = false; saveTask()">Retirer</button>
                </div>
            </form>
            <div v-for="t in tasks" :key="t.id" class="card" @click="taskForm = { id: t.id, name: t.name, frequency: t.frequency }">
                <div class="grow">{{ t.name }}</div><span class="muted">{{ FREQ[t.frequency] }}</span>
            </div>
        </template>

        <template v-if="view === 'export'">
            <h3>Registres HACCP en PDF</h3>
            <p class="muted">Relevés de température, refroidissements rapides et plan de nettoyage sur la période. Les alertes sans action corrective y apparaissent en rouge.</p>
            <div class="bar">
                <label>Du <input v-model="report.from" type="date" /></label>
                <label>Au <input v-model="report.to" type="date" /></label>
                <a :href="reportUrl()" target="_blank"><button class="primary">Ouvrir le PDF</button></a>
            </div>
            <p class="muted">La fiche de traçabilité d'un lot se télécharge depuis les onglets Préparations (lots fabriqués) et Stock (lots fournisseurs).</p>
        </template>
    </main>
</template>

<style scoped>
.alert { border-radius: 10px; padding: .6rem .9rem; margin-bottom: .6rem; font-size: .9rem; }
.bad { background: #fee2e2; border: 1px solid #fca5a5; }
.warn { background: #fef3c7; border: 1px solid #fcd34d; }
.alert button { padding: .2rem .5rem; margin-left: .4rem; }
</style>
