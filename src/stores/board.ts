import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { clearGuestSession, loadGuestSession, saveGuestSession } from '../lib/local-session'
import type { BoardState, Link, StorageMode, Wire, WireType } from '../lib/types'

function createBoardState(mode: StorageMode = 'local'): BoardState {
  return {
    rows: 25,
    cols: 64,
    components: [],
    cuts: [],
    links: [],
    wires: [],
    netlist: null,
    storageMode: mode,
    projectName: 'Untitled Stripboard',
  }
}

export const useBoardStore = defineStore('board', () => {
  const board = ref<BoardState>(loadGuestSession() ?? createBoardState())
  const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const counts = computed(() => ({
    cuts: board.value.cuts.length,
    links: board.value.links.length,
    wires: board.value.wires.length,
    components: board.value.components.length,
  }))

  function resetBoard() {
    board.value = createBoardState('local')
  }

  function renameProject(name: string) {
    board.value.projectName = name.trim() || 'Untitled Stripboard'
  }

  function addLink() {
    const startRow = 4 + (board.value.links.length % 8)
    const startCol = 6 + ((board.value.links.length * 5) % 42)

    const link: Link = {
      id: uuidv4(),
      fromRow: startRow,
      fromCol: startCol,
      toRow: Math.min(startRow + 3, board.value.rows - 1),
      toCol: Math.min(startCol + 4, board.value.cols - 1),
      color: ['#0f766e', '#2563eb', '#dc2626', '#7c3aed'][board.value.links.length % 4],
    }

    board.value.links.push(link)
  }

  function addWire(type: WireType = 'input') {
    const wire: Wire = {
      id: uuidv4(),
      row: 2 + (board.value.wires.length % 16),
      col: Math.min(2 + board.value.wires.length * 3, board.value.cols - 1),
      signalName: `${type.toUpperCase()}_${board.value.wires.length + 1}`,
      type,
    }

    board.value.wires.push(wire)
  }

  function setStorageMode(mode: StorageMode) {
    board.value.storageMode = mode
  }

  function loadCloudProject(projectId: string) {
    board.value = {
      ...createBoardState('cloud'),
      projectName: `Cloud Project ${projectId}`,
    }
  }

  function clearGuestCopy() {
    clearGuestSession()
    board.value = createBoardState('local')
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      online.value = true
    })

    window.addEventListener('offline', () => {
      online.value = false
    })
  }

  watch(
    board,
    (value) => {
      if (value.storageMode === 'local') {
        saveGuestSession(value)
      }
    },
    { deep: true },
  )

  return {
    board,
    counts,
    online,
    resetBoard,
    renameProject,
    addLink,
    addWire,
    setStorageMode,
    loadCloudProject,
    clearGuestCopy,
  }
})