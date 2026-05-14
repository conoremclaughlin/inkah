import { defineConfig } from 'wxt';

const debug = process.env.DEBUG === 'true';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',
  vite: () => ({
    build: {
      sourcemap: debug ? 'inline' : false,
    },
  }),
  manifest: {
    name: 'Inkah: Chinese & Korean Pop-up Dictionary',
    description:
      'Look up Korean & Chinese words while browsing the web. Hover over characters to see definitions, save words, and more.',
    permissions: ['storage'],
    icons: {
      16: 'images/inkah-logo-16.png',
      48: 'images/inkah-logo-48.png',
      128: 'images/inkah-logo-128.png',
    },
    web_accessible_resources: [
      {
        resources: ['data/*', 'images/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
