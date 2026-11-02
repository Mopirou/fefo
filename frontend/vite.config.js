import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Backend is on 3100, dev server on 5183: no clash with the game project (3000 / 5173).
export default defineConfig({
    plugins: [vue()],
    server: {
        port: 5183,
        proxy: { '/api': 'http://localhost:3100' },
    },
});
