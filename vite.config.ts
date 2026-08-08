import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  },
  build: {
    rollupOptions: {
      // Two entries, two bundles. The admin console is not a route inside the app
      // (there is no router) and it must not ship to clients — a separate entry is
      // what makes that structural rather than a convention someone has to
      // remember. Reachable at /admin.html, or /admin via the rewrite in
      // vercel.json.
      input: {
        main:  resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
