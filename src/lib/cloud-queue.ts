import type { BoardState } from './types'

const CLOUD_QUEUE_KEY = 'vcad-online.cloud-save-queue'

export interface CloudQueuedSave {
  projectId: string
  ownerUid: string
  board: BoardState
  queuedAt: string
}

function loadQueue() {
  if (typeof localStorage === 'undefined') {
    return [] as CloudQueuedSave[]
  }

  const serialized = localStorage.getItem(CLOUD_QUEUE_KEY)

  if (!serialized) {
    return [] as CloudQueuedSave[]
  }

  try {
    const parsed = JSON.parse(serialized) as CloudQueuedSave[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] as CloudQueuedSave[]
  }
}

function saveQueue(queue: CloudQueuedSave[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(CLOUD_QUEUE_KEY, JSON.stringify(queue))
}

export function getCloudQueueLength() {
  return loadQueue().length
}

export function enqueueCloudSave(save: CloudQueuedSave) {
  const queue = loadQueue().filter((entry) => entry.projectId !== save.projectId)
  queue.push(save)
  saveQueue(queue)
}

export function dequeueCloudSave(projectId: string) {
  const queue = loadQueue()
  const match = queue.find((entry) => entry.projectId === projectId)

  if (!match) {
    return null
  }

  const next = queue.filter((entry) => entry.projectId !== projectId)
  saveQueue(next)
  return match
}

export function getCloudQueueSnapshot() {
  return loadQueue()
}
