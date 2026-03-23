import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

import { firebaseConfig, firebaseReady } from './config'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

export function isFirebaseEnabled() {
  return firebaseReady
}

export function getFirebaseApp() {
  if (!firebaseReady) {
    return null
  }

  if (!app) {
    app = initializeApp(firebaseConfig)
  }

  return app
}

export function getFirebaseAuth() {
  if (!firebaseReady) {
    return null
  }

  if (!auth) {
    const firebaseApp = getFirebaseApp()

    if (!firebaseApp) {
      return null
    }

    auth = getAuth(firebaseApp)
  }

  return auth
}

export function getFirestoreDb() {
  if (!firebaseReady) {
    return null
  }

  if (!db) {
    const firebaseApp = getFirebaseApp()

    if (!firebaseApp) {
      return null
    }

    db = getFirestore(firebaseApp)
  }

  return db
}
