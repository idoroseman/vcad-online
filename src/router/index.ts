import { createRouter, createWebHistory } from 'vue-router'

import { waitForInitialAuthUser } from '../firebase/auth'
import { isFirebaseEnabled } from '../firebase/client'
import EditorView from '../views/EditorView.vue'
import LoginView from '../views/LoginView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import SharedProjectView from '../views/SharedProjectView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'editor',
      component: EditorView,
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/editor/:id',
      name: 'project-editor',
      component: EditorView,
      meta: { requiresAuth: true },
    },
    {
      path: '/share/:token',
      name: 'shared-project',
      component: SharedProjectView,
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) {
    return true
  }

  if (!isFirebaseEnabled()) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  const user = await waitForInitialAuthUser()

  if (!user) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  return true
})

export default router