import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

import { getFirebaseAuth, isFirebaseEnabled } from './client'

let initialAuthPromise: Promise<User | null> | null = null
let authInitialized = false

export function getCurrentUser() {
  const auth = getFirebaseAuth()
  return auth?.currentUser ?? null
}

export function observeAuthState(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth()

  if (!auth) {
    callback(null)
    return () => {
      // No-op when Firebase is disabled.
    }
  }

  return onAuthStateChanged(auth, callback)
}

export function waitForInitialAuthUser() {
  if (!isFirebaseEnabled()) {
    return Promise.resolve(null)
  }

  if (authInitialized) {
    return Promise.resolve(getCurrentUser())
  }

  if (initialAuthPromise) {
    return initialAuthPromise
  }

  initialAuthPromise = new Promise<User | null>((resolve) => {
    const stop = observeAuthState((user) => {
      stop()
      authInitialized = true
      initialAuthPromise = null
      resolve(user)
    })
  })

  return initialAuthPromise
}

export async function signInWithGooglePopup() {
  const auth = getFirebaseAuth()

  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  const provider = new GoogleAuthProvider()
  const credentials = await signInWithPopup(auth, provider)
  return credentials.user
}

export async function signInWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth()

  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  const credentials = await signInWithEmailAndPassword(auth, email, password)
  return credentials.user
}

export async function registerWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth()

  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  const credentials = await createUserWithEmailAndPassword(auth, email, password)
  return credentials.user
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth()

  if (!auth) {
    return
  }

  await signOut(auth)
}
