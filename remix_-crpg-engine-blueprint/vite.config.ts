import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const port = Number(process.env.PORT || 5000);
  const hmrPort = Number(process.env.HMR_PORT || port + 1);
  const hmr =
    process.env.DISABLE_HMR === 'true'
      ? false
      : {
          host: '127.0.0.1',
          port: hmrPort,
        } as const;

  return {
    // "/" for dev/root; set VITE_BASE (e.g. "/Crpg-Engine-7/") for sub-path deploys.
    base: process.env.VITE_BASE || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port,
      allowedHosts: true as const,
      hmr,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
