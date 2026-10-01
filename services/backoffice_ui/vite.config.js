import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    cors: true,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 500
    },
    proxy: {
      '/api': {
        target: process.env.BACKOFFICE_API_URL || 'http://backoffice-api:8000',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/v1': {
        target: process.env.BACKOFFICE_API_URL || 'http://backoffice-api:8000',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/docs': {
        target: process.env.BACKOFFICE_API_URL || 'http://backoffice-api:8000',
        changeOrigin: true
      },
      '/redoc': {
        target: process.env.BACKOFFICE_API_URL || 'http://backoffice-api:8000',
        changeOrigin: true
      },
      '/openapi.json': {
        target: process.env.BACKOFFICE_API_URL || 'http://backoffice-api:8000',
        changeOrigin: true
      },
      '/mcp': {
        target: process.env.MCP_SERVER_URL || 'http://mcp-server:8001',
        changeOrigin: true
      }
    }
  }
})
