import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/growth-os/',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'] // Explicitly tells the build tool to look for .jsx files
  }
})
