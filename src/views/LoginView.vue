<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { signInWithEmail, signInWithGooglePopup, waitForInitialAuthUser, registerWithEmail } from '../firebase/auth'
import { isFirebaseEnabled } from '../firebase/client'

const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const mode = ref<'signin' | 'signup'>('signin')
const firebaseEnabled = isFirebaseEnabled()

const redirectPath = computed(() => {
  const raw = route.query.redirect
  return typeof raw === 'string' && raw.length > 0 ? raw : '/'
})

function normalizeAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Authentication failed. Please try again.'
  }

  if (error.message.includes('auth/invalid-credential')) {
    return 'Invalid email or password.'
  }

  if (error.message.includes('auth/popup-closed-by-user')) {
    return 'Sign-in popup was closed before completion.'
  }

  if (error.message.includes('auth/email-already-in-use')) {
    return 'This email is already in use. Try signing in instead.'
  }

  return error.message
}

async function routeAfterLogin() {
  await router.push(redirectPath.value)
}

async function handleGoogleSignIn() {
  loading.value = true
  errorMessage.value = null

  try {
    await signInWithGooglePopup()
    await routeAfterLogin()
  } catch (error) {
    errorMessage.value = normalizeAuthError(error)
  } finally {
    loading.value = false
  }
}

async function handleEmailSubmit() {
  loading.value = true
  errorMessage.value = null

  try {
    if (mode.value === 'signup') {
      await registerWithEmail(email.value.trim(), password.value)
    } else {
      await signInWithEmail(email.value.trim(), password.value)
    }
    await routeAfterLogin()
  } catch (error) {
    errorMessage.value = normalizeAuthError(error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!firebaseEnabled) {
    return
  }

  const user = await waitForInitialAuthUser()

  if (user) {
    await routeAfterLogin()
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
    <div class="w-full max-w-md rounded-[32px] border border-black/10 bg-white/80 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
      <p class="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Sign In</p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Save online when you are ready</h1>
      <p class="mt-4 text-sm leading-6 text-stone-600">
        The editor works without sign-in. Authentication is only needed for cloud projects and shared library files.
      </p>

      <p v-if="!firebaseEnabled" class="mt-4 rounded-2xl border border-amber-300 bg-amber-100/70 px-4 py-3 text-sm text-amber-900">
        Firebase is not configured yet. Add VITE_FIREBASE_* values before using online mode.
      </p>

      <div class="mt-8 space-y-3">
        <button
          class="w-full rounded-full bg-stone-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading || !firebaseEnabled"
          @click="handleGoogleSignIn"
        >
          Continue with Google
        </button>

        <form class="space-y-3" @submit.prevent="handleEmailSubmit">
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-500"
            required
          />
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            minlength="6"
            placeholder="Password"
            class="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-500"
            required
          />

          <button
            type="submit"
            class="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loading || !firebaseEnabled"
          >
            {{ mode === 'signup' ? 'Create account' : 'Sign in with email' }}
          </button>
        </form>

        <button
          class="w-full text-sm text-stone-600 underline underline-offset-4"
          :disabled="loading"
          @click="mode = mode === 'signup' ? 'signin' : 'signup'"
        >
          {{ mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one' }}
        </button>
      </div>

      <p v-if="errorMessage" class="mt-4 rounded-2xl border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-900">
        {{ errorMessage }}
      </p>
    </div>
  </div>
</template>