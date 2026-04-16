import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
/*
use?
import react from '@vitejs/plugin-react'

export default {
  plugins: [react()],
}
*/