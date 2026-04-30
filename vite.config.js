import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:        'index.html',
        deep_work:   'deep_work_page_2.html',
        network:     'network_page_3.html',
        career_path: 'career_path_page_4.html',
        settings:    'settings_page_5.html',
      }
    }
  }
})