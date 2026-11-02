<script setup>
import { ref } from 'vue';
import { api } from '../api';

const props = defineProps({ users: { type: Array, default: () => [] } });
const emit = defineEmits(['done']);
const userId = ref(props.users[0]?.id ?? '');
const pin = ref('');
const error = ref('');

async function submit() {
    error.value = '';
    try {
        const r = await api.login(userId.value, pin.value);
        pin.value = '';
        emit('done', r.user);
    } catch (e) { error.value = e.message; pin.value = ''; }
}
</script>

<template>
    <main>
        <form @submit.prevent="submit" style="max-width: 360px; margin: 2rem auto">
            <h3 class="full">Qui es-tu ?</h3>
            <label class="full">Nom
                <select v-model="userId"><option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option></select>
            </label>
            <label class="full">Code PIN
                <input v-model="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required autofocus />
            </label>
            <div v-if="error" class="err">{{ error }}</div>
            <div class="actions full"><button class="primary">Se connecter</button></div>
        </form>
    </main>
</template>
