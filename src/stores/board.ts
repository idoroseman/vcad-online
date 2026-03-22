import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { clearGuestSession, loadGuestSession, saveGuestSession } from '../lib/local-session'
import type { ActiveTool, BoardState, Cut, Link, StorageMode, Wire, WireType } from '../lib/types'

type SelectedItem =
  | { kind: 'cut'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'wire'; id: string }
  | null

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
  const activeTool = ref<ActiveTool>('inspect')
  const activeWireType = ref<WireType>('input')
  const pendingLinkStart = ref<{ row: number; col: number } | null>(null)
  const selectedItem = ref<SelectedItem>(null)

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

  function createLink(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const link: Link = {
      id: uuidv4(),
      fromRow,
      fromCol,
      toRow,
      toCol,
      color: ['#0f766e', '#2563eb', '#dc2626', '#7c3aed'][board.value.links.length % 4],
    }

    board.value.links.push(link)
  }

  function createWire(row: number, col: number, type: WireType = 'input') {
    const wire: Wire = {
      id: uuidv4(),
      row,
      col,
      signalName: `${type.toUpperCase()}_${board.value.wires.length + 1}`,
      type,
    }

    board.value.wires.push(wire)
  }

  function toggleCut(row: number, col: number) {
    const existingIndex = board.value.cuts.findIndex((cut) => cut.row === row && cut.col === col)

    if (existingIndex >= 0) {
      board.value.cuts.splice(existingIndex, 1)
      return
    }

    const cut: Cut = {
      id: uuidv4(),
      row,
      col,
    }

    board.value.cuts.push(cut)
  }

  function setActiveTool(tool: ActiveTool) {
    activeTool.value = tool

    if (tool !== 'link') {
      pendingLinkStart.value = null
    }

    if (tool !== 'inspect') {
      selectedItem.value = null
    }
  }

  function setActiveWireType(type: WireType) {
    activeWireType.value = type
  }

  function placeAtHole(row: number, col: number) {
    if (activeTool.value === 'inspect') {
      return
    }

    if (activeTool.value === 'wire') {
      createWire(row, col, activeWireType.value)
      return
    }

    if (activeTool.value === 'cut') {
      toggleCut(row, col)
      return
    }

    if (!pendingLinkStart.value) {
      pendingLinkStart.value = { row, col }
      return
    }

    if (pendingLinkStart.value.row === row && pendingLinkStart.value.col === col) {
      pendingLinkStart.value = null
      return
    }

    createLink(pendingLinkStart.value.row, pendingLinkStart.value.col, row, col)
    pendingLinkStart.value = null
  }

  function inspectAtHole(row: number, col: number) {
    const cut = board.value.cuts.find((item) => item.row === row && item.col === col)
    if (cut) {
      selectedItem.value = { kind: 'cut', id: cut.id }
      return
    }

    const wire = board.value.wires.find((item) => item.row === row && item.col === col)
    if (wire) {
      selectedItem.value = { kind: 'wire', id: wire.id }
      return
    }

    const link = board.value.links.find(
      (item) =>
        (item.fromRow === row && item.fromCol === col) || (item.toRow === row && item.toCol === col),
    )
    if (link) {
      selectedItem.value = { kind: 'link', id: link.id }
      return
    }

    selectedItem.value = null
  }

  function deleteSelected() {
    if (!selectedItem.value) {
      return
    }

    if (selectedItem.value.kind === 'cut') {
      board.value.cuts = board.value.cuts.filter((item) => item.id !== selectedItem.value?.id)
    }

    if (selectedItem.value.kind === 'link') {
      board.value.links = board.value.links.filter((item) => item.id !== selectedItem.value?.id)
    }

    if (selectedItem.value.kind === 'wire') {
      board.value.wires = board.value.wires.filter((item) => item.id !== selectedItem.value?.id)
    }

    selectedItem.value = null
  }

  function updateSelectedLinkColor(color: string) {
    if (!selectedItem.value || selectedItem.value.kind !== 'link') {
      return
    }

    const link = board.value.links.find((item) => item.id === selectedItem.value?.id)

    if (!link) {
      return
    }

    link.color = color
  }

  function updateSelectedWireSignalName(signalName: string) {
    if (!selectedItem.value || selectedItem.value.kind !== 'wire') {
      return
    }

    const wire = board.value.wires.find((item) => item.id === selectedItem.value?.id)

    if (!wire) {
      return
    }

    wire.signalName = signalName
  }

  function updateSelectedWireType(type: WireType) {
    if (!selectedItem.value || selectedItem.value.kind !== 'wire') {
      return
    }

    const wire = board.value.wires.find((item) => item.id === selectedItem.value?.id)

    if (!wire) {
      return
    }

    wire.type = type
  }

  function updateSelectedWireNote(note: string) {
    if (!selectedItem.value || selectedItem.value.kind !== 'wire') {
      return
    }

    const wire = board.value.wires.find((item) => item.id === selectedItem.value?.id)

    if (!wire) {
      return
    }

    wire.note = note
  }

  function cancelPendingPlacement() {
    pendingLinkStart.value = null
    activeTool.value = 'inspect'
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
    activeTool,
    activeWireType,
    pendingLinkStart,
    selectedItem,
    resetBoard,
    renameProject,
    setActiveTool,
    setActiveWireType,
    toggleCut,
    placeAtHole,
    inspectAtHole,
    deleteSelected,
    updateSelectedLinkColor,
    updateSelectedWireSignalName,
    updateSelectedWireType,
    updateSelectedWireNote,
    cancelPendingPlacement,
    setStorageMode,
    loadCloudProject,
    clearGuestCopy,
  }
})