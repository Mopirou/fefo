<script setup>
// Camera barcode scanner. html5-qrcode is the default engine (works on iOS Safari,
// which has no BarcodeDetector); needs HTTPS on a phone.
import { ref, onBeforeUnmount } from 'vue';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const emit = defineEmits(['scan']);
const active = ref(false);
const error = ref('');
const ELEMENT_ID = 'scanner-view';
let scanner = null;

async function start() {
    error.value = '';
    active.value = true;
    await new Promise(r => setTimeout(r, 0)); // let the container render
    try {
        scanner = new Html5Qrcode(ELEMENT_ID, {
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.QR_CODE],
            useBarCodeDetectorIfSupported: true,
            verbose: false,
        });
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } },
            async (text) => { await stop(); emit('scan', text); }, () => {});
    } catch (e) {
        active.value = false;
        error.value = window.isSecureContext
            ? `Camera indisponible: ${e}`
            : 'La camera exige HTTPS: ouvrir la page en https:// (certificat mkcert installe sur le telephone).';
    }
}

async function stop() {
    if (scanner) {
        try { await scanner.stop(); scanner.clear(); } catch { /* already stopped */ }
        scanner = null;
    }
    active.value = false;
}

onBeforeUnmount(stop);
</script>

<template>
    <div>
        <button type="button" class="primary" @click="active ? stop() : start()">{{ active ? 'Arrêter le scan' : '📷 Scanner' }}</button>
        <div v-if="error" class="err">{{ error }}</div>
        <div v-show="active" :id="ELEMENT_ID" class="scanner"></div>
    </div>
</template>

<style scoped>
.scanner { max-width: 360px; margin-top: .5rem; }
</style>
