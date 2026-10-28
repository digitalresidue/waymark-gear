import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
    // Built files are served from /dist (public/dist). Without this, Vite
    // writes /assets/... into CSS font urls and lazy-loaded chunks, which
    // the server doesn't serve. The dev server keeps its own root.
    base: command === 'build' ? '/dist/' : '/',
    // Express serves public/ itself (publicDir is off), so root-absolute
    // urls in templates like /images/... must stay urls, not imports.
    plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
    define: {
        global: 'globalThis',
    },
    publicDir: false,
    build: {
        outDir: 'public/dist',
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
            external: (id) => id.startsWith('/images/') || id.startsWith('/fonts/'),
            input: {
                app: `${import.meta.dirname}/client/lighterpack.js`,
                share: `${import.meta.dirname}/client/share-entry.js`,
                embed: `${import.meta.dirname}/client/embed-entry.js`,
                // CSS-only entry: /privacy and any future long-form doc page
                // ships no JavaScript, so there is nothing to pair this with.
                doc: `${import.meta.dirname}/client/css/doc.scss`,
            },
        },
    },
    server: {
        fs: { deny: [`${import.meta.dirname}/config/**`] },
    },
    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ['import', 'legacy-js-api', 'color-functions'],
            },
        },
    },
}));
