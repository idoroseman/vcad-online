import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'

import type { BoardState } from '../lib/types'
import { getCurrentUser } from './auth'
import { getFirestoreDb } from './client'

export interface CloudProjectRecord {
  id: string
  ownerUid: string
  name: string
  board: BoardState
  createdAt?: Timestamp
  updatedAt?: Timestamp
  shareEnabled?: boolean
  shareToken?: string | null
}

export interface CloudProjectSummary {
  id: string
  name: string
  updatedAtLabel: string
  shareEnabled: boolean
  isEmpty: boolean
}

interface SaveBoardPayload {
  id: string
  ownerUid: string
  name: string
  board: BoardState
}

interface CreateProjectPayload {
  ownerUid: string
  name: string
  board: BoardState
}

function ensureFirestore() {
  const db = getFirestoreDb()

  if (!db) {
    throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to enable cloud mode.')
  }

  return db
}

function resolveOwnerUid(fallbackUid?: string) {
  const authUid = getCurrentUser()?.uid

  if (authUid) {
    return authUid
  }

  if (fallbackUid?.trim()) {
    return fallbackUid.trim()
  }

  throw new Error('Not signed in. Please sign in again before saving cloud projects.')
}

function toCloudError(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error)) {
    return new Error(fallbackMessage)
  }

  if (error.message.includes('Missing or insufficient permissions')) {
    return new Error('Cloud access denied. Deploy firestore.rules and verify project ownership in Firestore.')
  }

  return error
}

function projectsCollection() {
  return collection(ensureFirestore(), 'projects')
}

function sharedProjectsCollection() {
  return collection(ensureFirestore(), 'sharedProjects')
}

function createShareToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }

  const fallback = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}${fallback}`
}

function formatRelativeTimestamp(value?: Timestamp) {
  if (!value) {
    return 'just now'
  }

  const elapsedMs = Date.now() - value.toMillis()

  if (elapsedMs < 60_000) {
    return 'just now'
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) {
    return `${elapsedDays}d ago`
  }

  const elapsedWeeks = Math.floor(elapsedDays / 7)
  return `${elapsedWeeks}w ago`
}

export async function loadCloudProjectById(projectId: string) {
  const projectRef = doc(projectsCollection(), projectId)
  const projectDoc = await getDoc(projectRef)

  if (!projectDoc.exists()) {
    throw new Error('Cloud project not found.')
  }

  const data = projectDoc.data() as Omit<CloudProjectRecord, 'id'>

  return {
    id: projectDoc.id,
    ownerUid: data.ownerUid,
    name: data.name,
    board: data.board,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    shareEnabled: data.shareEnabled,
    shareToken: data.shareToken,
  } satisfies CloudProjectRecord
}

export async function listCloudProjectsByOwner(ownerUid: string) {
  const q = query(projectsCollection(), where('ownerUid', '==', ownerUid), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)

  return snapshot.docs.flatMap((projectDoc) => {
    const data = projectDoc.data() as Omit<CloudProjectRecord, 'id'>

    if ((data as { deletedAt?: unknown }).deletedAt) {
      return [] as CloudProjectSummary[]
    }

    const board = data.board
    const isEmpty = !(
      board.components.length > 0 ||
      board.cuts.length > 0 ||
      board.links.length > 0 ||
      board.wires.length > 0 ||
      board.netlist
    )

    return {
      id: projectDoc.id,
      name: data.name,
      updatedAtLabel: formatRelativeTimestamp(data.updatedAt),
      shareEnabled: Boolean(data.shareEnabled),
      isEmpty,
    } satisfies CloudProjectSummary
  })
}

export async function createCloudProject(payload: CreateProjectPayload) {
  const ownerUid = resolveOwnerUid(payload.ownerUid)
  const projectRef = doc(projectsCollection())

  try {
    await setDoc(projectRef, {
      ownerUid,
      name: payload.name,
      board: payload.board,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      shareEnabled: false,
      shareToken: null,
      isPublic: false,
    })
  } catch (error) {
    throw toCloudError(error, 'Failed to create cloud project.')
  }

  return projectRef.id
}

export async function saveCloudProjectBoard(payload: SaveBoardPayload) {
  const ownerUid = resolveOwnerUid(payload.ownerUid)
  const projectRef = doc(projectsCollection(), payload.id)
  let existingDoc

  try {
    existingDoc = await getDoc(projectRef)
  } catch (error) {
    throw toCloudError(error, 'Failed to read cloud project before save.')
  }

  if (!existingDoc.exists()) {
    try {
      await setDoc(projectRef, {
        ownerUid,
        name: payload.name,
        board: payload.board,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        shareEnabled: false,
        shareToken: null,
      })
    } catch (error) {
      throw toCloudError(error, 'Failed to create cloud project during autosave.')
    }
    return
  }

  const existingData = existingDoc.data() as Omit<CloudProjectRecord, 'id'>

  try {
    await updateDoc(projectRef, {
      ownerUid,
      name: payload.name,
      board: payload.board,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toCloudError(error, 'Failed to update cloud project.')
  }

  if (existingData.shareEnabled && existingData.shareToken) {
    const sharedRef = doc(sharedProjectsCollection(), existingData.shareToken)

    try {
      await setDoc(
        sharedRef,
        {
          projectId: payload.id,
          ownerUid,
          name: payload.name,
          board: payload.board,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } catch (error) {
      // The project document has already been saved; shared mirror sync should not fail autosave.
      console.warn('Shared mirror sync failed:', toCloudError(error, 'Failed to update shared project mirror.').message)
    }
  }
}

export async function renameCloudProject(projectId: string, name: string) {
  const projectRef = doc(projectsCollection(), projectId)
  await updateDoc(projectRef, {
    name,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCloudProject(projectId: string) {
  const projectRef = doc(projectsCollection(), projectId)
  await deleteDoc(projectRef)
}

export async function enableCloudProjectShare(projectId: string) {
  const projectRef = doc(projectsCollection(), projectId)
  const projectDoc = await getDoc(projectRef)

  if (!projectDoc.exists()) {
    throw new Error('Project not found.')
  }

  const data = projectDoc.data() as Omit<CloudProjectRecord, 'id'>
  const nextToken = createShareToken()

  await updateDoc(projectRef, {
    shareEnabled: true,
    shareToken: nextToken,
    updatedAt: serverTimestamp(),
  })

  const sharedRef = doc(sharedProjectsCollection(), nextToken)
  await setDoc(sharedRef, {
    projectId,
    ownerUid: data.ownerUid,
    name: data.name,
    board: data.board,
    updatedAt: serverTimestamp(),
  })

  if (data.shareToken) {
    await deleteDoc(doc(sharedProjectsCollection(), data.shareToken))
  }

  return nextToken
}

export async function disableCloudProjectShare(projectId: string) {
  const projectRef = doc(projectsCollection(), projectId)
  const projectDoc = await getDoc(projectRef)

  if (projectDoc.exists()) {
    const data = projectDoc.data() as Omit<CloudProjectRecord, 'id'>

    if (data.shareToken) {
      await deleteDoc(doc(sharedProjectsCollection(), data.shareToken))
    }
  }

  await updateDoc(projectRef, {
    shareEnabled: false,
    shareToken: null,
    updatedAt: serverTimestamp(),
  })
}

export async function loadSharedProjectByToken(shareToken: string) {
  const sharedDoc = await getDoc(doc(sharedProjectsCollection(), shareToken))

  if (!sharedDoc.exists()) {
    throw new Error('Shared project not found.')
  }

  const data = sharedDoc.data() as Omit<CloudProjectRecord, 'id'> & { projectId?: string }

  return {
    id: data.projectId ?? sharedDoc.id,
    ownerUid: data.ownerUid,
    name: data.name,
    board: data.board,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    shareEnabled: data.shareEnabled,
    shareToken: data.shareToken,
  } satisfies CloudProjectRecord
}
