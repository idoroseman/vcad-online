import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { initAnalytics } from './lib/analytics'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
initAnalytics(router)

app.mount('#app')
