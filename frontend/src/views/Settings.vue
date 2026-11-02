<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const emit = defineEmits(['session-changed']);
const s = ref(null);
const printers = ref([]);
const users = ref([]);
const backup = ref(null);
const tables = ref([]);
const userForm = ref(null);
const message = ref('');
const error = ref('');

async function load() {
    [s.value, users.value, backup.value, tables.value] = await Promise.all([
        api.settings(), api.users(), api.backupStatus(), api.exportTables(),
    ]);
}
async function run(fn, ok) {
    error.value = ''; message.value = '';
    try { await fn(); message.value = ok; await load(); return true; }
    catch (e) { error.value = e.message; return false; }
}
const save = () => run(async () => { s.value = await api.saveSettings(s.value); }, 'Réglages enregistrés.');
const backupNow = () => run(() => api.runBackup(), 'Sauvegarde effectuée.');
async function saveUser() {
    const u = userForm.value;
    const first = !users.value.length;
    const ok = await run(() => (u.id ? api.updateUser(u.id, { name: u.name, pin: u.pin }) : api.createUser(u)), 'Compte enregistré.');
    if (ok) { userForm.value = null; if (first) emit('session-changed'); }
}
const toggleUser = (u) => run(() => api.updateUser(u.id, { active: !u.active }), u.active ? 'Compte désactivé.' : 'Compte réactivé.');
const fmtSize = (n) => (n / 1024).toFixed(0) + ' Ko';

onMounted(async () => {
    await load();
    printers.value = await api.printers().catch(() => []);
});
</script>

<template>
    <main>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="error" class="err">{{ error }}</div>

        <form v-if="s" @submit.prevent="save">
            <label class="full">Imprimante d'étiquettes
                <select v-model="s.printer">
                    <option value="">— aucune —</option>
                    <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
                </select>
            </label>
            <label>DLC max d'une préparation (jours)<input v-model.number="s.prep_dlc_max_days" type="number" min="1" max="30" /></label>
            <label>DLC après décongélation (heures, max 48)<input v-model.number="s.thaw_dlc_hours" type="number" min="1" max="48" /></label>
            <label>Refroidissement rapide : durée max (min)<input v-model.number="s.cooling_max_minutes" type="number" min="10" max="600" /></label>
            <label>Refroidissement rapide : température à atteindre (°C)<input v-model.number="s.cooling_target_temp" type="number" min="0" max="30" /></label>
            <label class="full">Nom de l'établissement (en-tête des PDF)<input v-model="s.establishment" /></label>
            <label class="full">Dossier de sauvegarde (vide = backend/data/backups ; mettre un dossier Google Drive ou une clé USB)<input v-model="s.backup_dir" /></label>
            <label>Sauvegardes conservées<input v-model.number="s.backup_keep" type="number" min="1" max="365" /></label>
            <p class="muted full">Valeurs par défaut du cahier des charges : 3 jours, 24 h, 2 h, 30 sauvegardes. À aligner sur le plan de maîtrise sanitaire.</p>
            <div class="actions full"><button class="primary">Enregistrer</button></div>
        </form>

        <h3>Sauvegarde</h3>
        <div v-if="backup" class="card" style="display: block">
            <div :class="{ danger: backup.stale }">
                {{ backup.last_day ? `Dernière sauvegarde : ${backup.last_day}` : 'Aucune sauvegarde pour l\'instant' }}
                <strong v-if="backup.stale"> ⚠ à vérifier</strong>
            </div>
            <div class="muted">{{ backup.dir }} · {{ backup.count }} version(s)</div>
            <div v-if="backup.last_error" class="err">Dernier échec : {{ backup.last_error }}</div>
            <div v-for="f in backup.files" :key="f.name" class="muted">{{ f.name }} ({{ fmtSize(f.size) }})</div>
            <button class="primary" style="margin-top: .5rem" @click="backupNow">Sauvegarder maintenant</button>
        </div>
        <p class="muted">Une sauvegarde est faite automatiquement une fois par jour tant que le serveur tourne. Restauration : arrêter le serveur, puis copier une sauvegarde par-dessus <code>backend/data/haccp.db</code>.</p>

        <h3>Comptes (code PIN)</h3>
        <p class="muted">Tant qu'aucun compte n'existe, l'appli est ouverte. Dès le premier compte, chaque saisie est attribuée à son auteur et la connexion devient obligatoire.</p>
        <button class="primary" @click="userForm = { name: '', pin: '' }">+ Compte</button>
        <form v-if="userForm" @submit.prevent="saveUser">
            <label>Nom<input v-model="userForm.name" required /></label>
            <label>Code PIN (4 à 8 chiffres){{ userForm.id ? ' — vide = inchangé' : '' }}
                <input v-model="userForm.pin" type="password" inputmode="numeric" maxlength="8" :required="!userForm.id" autocomplete="new-password" /></label>
            <div class="actions full"><button class="primary">Enregistrer</button><button type="button" @click="userForm = null">Annuler</button></div>
        </form>
        <div v-for="u in users" :key="u.id" class="card" :style="{ opacity: u.active ? 1 : 0.5 }">
            <div class="grow">{{ u.name }}<span v-if="!u.active" class="muted"> · désactivé</span></div>
            <button @click="userForm = { id: u.id, name: u.name, pin: '' }">Modifier</button>
            <button @click="toggleUser(u)">{{ u.active ? 'Désactiver' : 'Réactiver' }}</button>
        </div>

        <h3>Export CSV</h3>
        <p class="muted">Une table par fichier (séparateur « ; », s'ouvre dans Excel).</p>
        <div class="bar"><a v-for="t in tables" :key="t" :href="`/api/export/${t}.csv`"><button>{{ t }}</button></a></div>
    </main>
</template>
