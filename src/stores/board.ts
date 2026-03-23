import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import {
  footprintCatalog,
  getBodyRadius,
  getComponentBounds,
  getComponentPinHoles,
  getDipPinCount,
  getDipWidth,
  getFootprint,
  getLeadPitch,
  getPinLayout,
} from '../lib/footprints'
import { parseKiCadNetlist } from '../lib/kicad-netlist'
import { dequeueCloudSave, enqueueCloudSave, getCloudQueueLength, getCloudQueueSnapshot } from '../lib/cloud-queue'
import { clearGuestSession, loadGuestSession, saveGuestSession } from '../lib/local-session'
import { waitForInitialAuthUser } from '../firebase/auth'
import { getFirebaseAuth, isFirebaseEnabled } from '../firebase/client'
import { disableCloudProjectShare, enableCloudProjectShare, loadCloudProjectById, saveCloudProjectBoard } from '../firebase/projects'
import type {
  ActiveTool,
  BoardState,
  Cut,
  Link,
  Netlist,
  PinLayout,
  PlacedComponent,
  StorageMode,
  Wire,
  WireType,
} from '../lib/types'

type SelectedItem =
  | { kind: 'cut'; id: string }
  | { kind: 'component'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'wire'; id: string }
  | null

type CloudSaveState = 'idle' | 'saving' | 'saved' | 'queued' | 'error'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isHoleWithinBoard(row: number, col: number, rows: number, cols: number) {
  return row >= 0 && row < rows && col >= 0 && col < cols
}

function normalizeRefDes(value: string) {
  return value.trim().toUpperCase()
}

function cloneBoardState(value: BoardState): BoardState {
  return JSON.parse(JSON.stringify(value)) as BoardState
}

const CLOUD_AUTOSAVE_DELAY_MS = 1000

function isRetryableCloudError(message: string) {
  const normalized = message.toLowerCase()

  return (
    normalized.includes('offline') ||
    normalized.includes('network') ||
    normalized.includes('unavailable') ||
    normalized.includes('timeout')
  )
}

function isDiscardableQueuedCloudError(message: string) {
  return (
    message.includes('Cloud access denied') ||
    message.includes('Project not found') ||
    message.includes('Cloud project not found')
  )
}

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
  const showRatsnest = ref(true)
  const activeTool = ref<ActiveTool>('inspect')
  const activeFootprintId = ref(footprintCatalog[0].id)
  const activeWireType = ref<WireType>('input')
  const pendingLinkStart = ref<{ row: number; col: number } | null>(null)
  const selectedItem = ref<SelectedItem>(null)
  const cloudProjectId = ref<string | null>(null)
  const cloudSaveState = ref<CloudSaveState>('idle')
  const cloudSaveError = ref<string | null>(null)
  const cloudQueuedWrites = ref(getCloudQueueLength())
  const cloudOwnerUid = ref<string | null>(null)
  const cloudEnabled = ref(isFirebaseEnabled())
  const cloudShareToken = ref<string | null>(null)
  const cloudShareEnabled = ref(false)

  let suppressNextCloudAutosave = false
  let cloudAutosaveTimer: ReturnType<typeof setTimeout> | null = null

  const counts = computed(() => ({
    cuts: board.value.cuts.length,
    links: board.value.links.length,
    wires: board.value.wires.length,
    components: board.value.components.length,
  }))

  function getCloudOwnerUid() {
    const auth = getFirebaseAuth()
    const uid = auth?.currentUser?.uid

    if (uid) {
      cloudOwnerUid.value = uid
      return uid
    }

    return cloudOwnerUid.value
  }

  function setCloudOwner(userUid: string | null) {
    cloudOwnerUid.value = userUid?.trim() || null
  }

  function isBoardEmpty(state: BoardState) {
    return (
      state.components.length === 0 &&
      state.cuts.length === 0 &&
      state.links.length === 0 &&
      state.wires.length === 0 &&
      !state.netlist
    )
  }

  async function saveCloudSnapshot(snapshot: BoardState) {
    if (snapshot.storageMode !== 'cloud') {
      return
    }

    // Never save empty boards to cloud.
    if (isBoardEmpty(snapshot)) {
      cloudSaveError.value = null
      cloudSaveState.value = 'idle'
      return
    }

    const projectId = cloudProjectId.value

    if (!projectId) {
      return
    }

    let ownerUid = getCloudOwnerUid()

    if (!ownerUid) {
      const user = await waitForInitialAuthUser()
      ownerUid = user?.uid ?? null

      if (ownerUid) {
        cloudOwnerUid.value = ownerUid
      }
    }

    if (!ownerUid) {
      cloudSaveState.value = 'error'
      cloudSaveError.value = 'Sign in again to enable cloud saving.'
      return
    }

    if (!online.value || !cloudEnabled.value) {
      enqueueCloudSave({
        projectId,
        ownerUid,
        board: snapshot,
        queuedAt: new Date().toISOString(),
      })
      cloudQueuedWrites.value = getCloudQueueLength()
      cloudSaveState.value = 'queued'
      return
    }

    cloudSaveState.value = 'saving'
    cloudSaveError.value = null

    try {
      await saveCloudProjectBoard({
        id: projectId,
        ownerUid,
        name: snapshot.projectName,
        board: snapshot,
      })
      cloudQueuedWrites.value = getCloudQueueLength()
      cloudSaveState.value = 'saved'
      cloudSaveError.value = null
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud save failed.'

      if (isRetryableCloudError(message)) {
        enqueueCloudSave({
          projectId,
          ownerUid,
          board: snapshot,
          queuedAt: new Date().toISOString(),
        })
        cloudQueuedWrites.value = getCloudQueueLength()
        cloudSaveState.value = 'queued'
        cloudSaveError.value = null
        return
      }

      cloudSaveState.value = 'error'
      cloudSaveError.value = message
    }
  }

  function scheduleCloudAutosave() {
    if (cloudAutosaveTimer) {
      clearTimeout(cloudAutosaveTimer)
    }

    if (isBoardEmpty(board.value)) {
      cloudSaveError.value = null
      cloudSaveState.value = 'idle'
      return
    }

    const snapshot = cloneBoardState(board.value)
    cloudAutosaveTimer = setTimeout(() => {
      void saveCloudSnapshot(snapshot)
    }, CLOUD_AUTOSAVE_DELAY_MS)
  }

  async function flushCloudQueue() {
    if (!online.value || !cloudEnabled.value) {
      return
    }

    // Purge stale entries that belong to a different (or missing) owner before processing.
    // This cleans up old guest-UID entries and entries from previous sessions.
    const currentUid = getCloudOwnerUid()
    for (const entry of getCloudQueueSnapshot()) {
      if (!entry.ownerUid || (currentUid && entry.ownerUid !== currentUid)) {
        console.warn('Purging stale cloud queue entry for project', entry.projectId, '(ownerUid mismatch)')
        dequeueCloudSave(entry.projectId)
      }
    }

    const queue = getCloudQueueSnapshot()
    const activeProjectQueueId = cloudProjectId.value
    const tracksActiveProject = Boolean(
      activeProjectQueueId && queue.some((entry) => entry.projectId === activeProjectQueueId),
    )

    if (queue.length === 0) {
      cloudQueuedWrites.value = 0
      return
    }

    if (tracksActiveProject) {
      cloudSaveState.value = 'saving'
      cloudSaveError.value = null
    }

    for (const entry of queue) {
      const isActiveEntry = entry.projectId === activeProjectQueueId

      if (!entry.ownerUid) {
        dequeueCloudSave(entry.projectId)
        continue
      }

      try {
        await saveCloudProjectBoard({
          id: entry.projectId,
          ownerUid: entry.ownerUid,
          name: entry.board.projectName,
          board: entry.board,
        })
        dequeueCloudSave(entry.projectId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to flush queued cloud saves.'

        if (isDiscardableQueuedCloudError(message)) {
          dequeueCloudSave(entry.projectId)
          continue
        }

        cloudQueuedWrites.value = getCloudQueueLength()

        if (isActiveEntry) {
          if (isRetryableCloudError(message)) {
            cloudSaveState.value = 'queued'
            cloudSaveError.value = null
          } else {
            cloudSaveState.value = 'error'
            cloudSaveError.value = message
          }
        }

        return
      }
    }

    cloudQueuedWrites.value = getCloudQueueLength()

    if (tracksActiveProject) {
      cloudSaveState.value = 'saved'
      cloudSaveError.value = null
    }
  }

  function normalizeHole(row: number, col: number) {
    return {
      row: clamp(Math.round(row), 0, board.value.rows - 1),
      col: clamp(Math.round(col), 0, board.value.cols - 1),
    }
  }

  function isComponentWithinBoard(component: PlacedComponent, rows = board.value.rows, cols = board.value.cols) {
    const bounds = getComponentBounds(component)

    return (
      bounds.minRow >= 0 &&
      bounds.minCol >= 0 &&
      bounds.maxRow <= rows - 1 &&
      bounds.maxCol <= cols - 1 &&
      getComponentPinHoles(component).every((pin) => isHoleWithinBoard(pin.row, pin.col, rows, cols))
    )
  }

  function componentsOverlap(left: PlacedComponent, right: PlacedComponent) {
    const leftBounds = getComponentBounds(left)
    const rightBounds = getComponentBounds(right)

    return !(
      leftBounds.maxRow < rightBounds.minRow ||
      leftBounds.minRow > rightBounds.maxRow ||
      leftBounds.maxCol < rightBounds.minCol ||
      leftBounds.minCol > rightBounds.maxCol
    )
  }

  function parseDipPinsHint(footprintHint: string | undefined) {
    if (!footprintHint) {
      return undefined
    }

    const match = footprintHint.match(/(?:dip|pdip|dil)[-_ ]?(\d+)/i) ?? footprintHint.match(/(\d+)\s*pin/i)

    if (!match || !match[1]) {
      return undefined
    }

    const parsed = Number.parseInt(match[1], 10)

    if (Number.isNaN(parsed)) {
      return undefined
    }

    return parsed
  }

  function selectFootprintForImportedComponent(refDes: string, footprintHint?: string) {
    const normalizedRef = normalizeRefDes(refDes)
    const hint = footprintHint?.toLowerCase() ?? ''

    if (hint.includes('dip') || hint.includes('pdip') || hint.includes('dil') || normalizedRef.startsWith('U')) {
      return 'dip-8'
    }

    if (normalizedRef.startsWith('C')) {
      return 'capacitor-radial-3'
    }

    return 'resistor-axial-7'
  }

  function findPlacementSpot(candidate: PlacedComponent) {
    const rowStep = 4
    const colStep = 8

    for (let row = 1; row < board.value.rows; row += rowStep) {
      for (let col = 1; col < board.value.cols; col += colStep) {
        const positioned = {
          ...candidate,
          row,
          col,
        }

        if (!isComponentWithinBoard(positioned)) {
          continue
        }

        const collision = board.value.components.some((existing) => componentsOverlap(positioned, existing))

        if (!collision) {
          return { row, col }
        }
      }
    }

    return null
  }

  function defaultRotationForFootprint(footprintId: string): PlacedComponent['rotation'] {
    const footprint = getFootprint(footprintId)
    return footprint.style === 'axial' ? 1 : 0
  }

  function createPlacedImportedComponent(refDes: string, value: string, footprintHint?: string) {
    const footprintId = selectFootprintForImportedComponent(refDes, footprintHint)
    const footprint = getFootprint(footprintId)
    const parsedDipPins = parseDipPinsHint(footprintHint)
    const component: PlacedComponent = {
      id: uuidv4(),
      footprintId,
      refDes: refDes.trim(),
      value: value.trim() || footprint.defaultValue,
      row: 0,
      col: 0,
      rotation: defaultRotationForFootprint(footprintId),
      polarityMarked: false,
      leadPitch: footprint.defaultLeadPitch,
      bodyRadius: footprint.defaultBodyRadius,
      dipPins: footprint.style === 'dip' ? parsedDipPins ?? footprint.defaultDipPins : footprint.defaultDipPins,
      dipWidth: footprint.defaultDipWidth,
      pinLayout: footprint.style === 'dip' ? 'dual-row' : undefined,
    }

    const placement = findPlacementSpot(component)

    if (!placement) {
      return null
    }

    component.row = placement.row
    component.col = placement.col
    return component
  }

  function syncPlacedComponentsFromNetlist(netlist: Netlist) {
    const existingByRef = new Map(
      board.value.components.map((component) => [normalizeRefDes(component.refDes), component]),
    )

    for (const imported of netlist.components) {
      const normalizedRef = normalizeRefDes(imported.refDes)

      if (!normalizedRef) {
        continue
      }

      const existing = existingByRef.get(normalizedRef)

      if (existing) {
        if (imported.value.trim().length > 0) {
          existing.value = imported.value.trim()
        }
        continue
      }

      const created = createPlacedImportedComponent(imported.refDes, imported.value, imported.footprintHint)

      if (!created) {
        continue
      }

      board.value.components.push(created)
      existingByRef.set(normalizedRef, created)
    }
  }

  function resetBoard() {
    board.value = createBoardState('local')
    cloudProjectId.value = null
    cloudSaveState.value = 'idle'
    cloudSaveError.value = null
    cloudShareToken.value = null
    cloudShareEnabled.value = false
  }

  function resizeBoard(rows: number, cols: number) {
    const nextRows = clamp(Math.round(rows), 5, 200)
    const nextCols = clamp(Math.round(cols), 8, 200)

    board.value.rows = nextRows
    board.value.cols = nextCols
    board.value.cuts = board.value.cuts.filter((item) => isHoleWithinBoard(item.row, item.col, nextRows, nextCols))
    board.value.wires = board.value.wires.filter((item) => isHoleWithinBoard(item.row, item.col, nextRows, nextCols))
    board.value.links = board.value.links.filter(
      (item) =>
        isHoleWithinBoard(item.fromRow, item.fromCol, nextRows, nextCols) &&
        isHoleWithinBoard(item.toRow, item.toCol, nextRows, nextCols),
    )
    board.value.components = board.value.components.filter((item) => isComponentWithinBoard(item, nextRows, nextCols))

    if (
      pendingLinkStart.value &&
      !isHoleWithinBoard(pendingLinkStart.value.row, pendingLinkStart.value.col, nextRows, nextCols)
    ) {
      pendingLinkStart.value = null
    }

    if (!selectedItem.value) {
      return
    }

    if (selectedItem.value.kind === 'cut') {
      const cutExists = board.value.cuts.some((item) => item.id === selectedItem.value?.id)

      if (!cutExists) {
        selectedItem.value = null
      }
    }

    if (selectedItem.value?.kind === 'component') {
      const componentExists = board.value.components.some((item) => item.id === selectedItem.value?.id)

      if (!componentExists) {
        selectedItem.value = null
      }
    }

    if (selectedItem.value?.kind === 'wire') {
      const wireExists = board.value.wires.some((item) => item.id === selectedItem.value?.id)

      if (!wireExists) {
        selectedItem.value = null
      }
    }

    if (selectedItem.value?.kind === 'link') {
      const linkExists = board.value.links.some((item) => item.id === selectedItem.value?.id)

      if (!linkExists) {
        selectedItem.value = null
      }
    }
  }

  function cropBoard() {
    let minRow = Number.POSITIVE_INFINITY
    let maxRow = Number.NEGATIVE_INFINITY
    let minCol = Number.POSITIVE_INFINITY
    let maxCol = Number.NEGATIVE_INFINITY

    const includeHole = (row: number, col: number) => {
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
    }

    for (const cut of board.value.cuts) {
      includeHole(cut.row, cut.col)
    }

    for (const wire of board.value.wires) {
      includeHole(wire.row, wire.col)
    }

    for (const link of board.value.links) {
      includeHole(link.fromRow, link.fromCol)
      includeHole(link.toRow, link.toCol)
    }

    for (const component of board.value.components) {
      const bounds = getComponentBounds(component)
      includeHole(bounds.minRow, bounds.minCol)
      includeHole(bounds.maxRow, bounds.maxCol)
    }

    if (!Number.isFinite(minRow) || !Number.isFinite(minCol) || !Number.isFinite(maxRow) || !Number.isFinite(maxCol)) {
      return
    }

    const rowOffset = minRow
    const colOffset = minCol

    for (const cut of board.value.cuts) {
      cut.row -= rowOffset
      cut.col -= colOffset
    }

    for (const wire of board.value.wires) {
      wire.row -= rowOffset
      wire.col -= colOffset
    }

    for (const link of board.value.links) {
      link.fromRow -= rowOffset
      link.fromCol -= colOffset
      link.toRow -= rowOffset
      link.toCol -= colOffset
    }

    for (const component of board.value.components) {
      component.row -= rowOffset
      component.col -= colOffset
    }

    if (pendingLinkStart.value) {
      pendingLinkStart.value = {
        row: pendingLinkStart.value.row - rowOffset,
        col: pendingLinkStart.value.col - colOffset,
      }
    }

    const nextRows = clamp(Math.floor(maxRow - minRow + 1), 5, 200)
    const nextCols = clamp(Math.floor(maxCol - minCol + 1), 8, 200)

    board.value.rows = nextRows
    board.value.cols = nextCols
  }

  function setSelectedItem(item: SelectedItem) {
    selectedItem.value = item
  }

  function setActiveFootprint(footprintId: string) {
    activeFootprintId.value = footprintCatalog.some((item) => item.id === footprintId)
      ? footprintId
      : footprintCatalog[0].id
  }

  function renameProject(name: string) {
    board.value.projectName = name.trim() || 'Untitled Stripboard'
  }

  function setNetlist(netlist: Netlist | null) {
    board.value.netlist = netlist
  }

  function importKiCadNetlist(source: string) {
    const netlist = parseKiCadNetlist(source)
    board.value.netlist = netlist
    syncPlacedComponentsFromNetlist(netlist)
    return netlist
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

  function createComponent(row: number, col: number) {
    const footprint = getFootprint(activeFootprintId.value)
    const countForPrefix = board.value.components.filter((item) => item.refDes.startsWith(footprint.prefix)).length + 1
    const component: PlacedComponent = {
      id: uuidv4(),
      footprintId: footprint.id,
      refDes: `${footprint.prefix}${countForPrefix}`,
      value: footprint.defaultValue,
      row,
      col,
      rotation: defaultRotationForFootprint(footprint.id),
      polarityMarked: false,
      leadPitch: footprint.defaultLeadPitch,
      bodyRadius: footprint.defaultBodyRadius,
      dipPins: footprint.defaultDipPins,
      dipWidth: footprint.defaultDipWidth,
      pinLayout: footprint.style === 'dip' ? 'dual-row' : undefined,
    }

    if (!isComponentWithinBoard(component)) {
      return
    }

    board.value.components.push(component)
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

    if (activeTool.value === 'component') {
      createComponent(row, col)
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
    const component = board.value.components.find((item) =>
      getComponentPinHoles(item).some((pin) => pin.row === row && pin.col === col),
    )
    if (component) {
      selectedItem.value = { kind: 'component', id: component.id }
      return
    }

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

    if (selectedItem.value.kind === 'component') {
      board.value.components = board.value.components.filter((item) => item.id !== selectedItem.value?.id)
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

  function moveSelectedCut(row: number, col: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'cut') {
      return
    }

    const cut = board.value.cuts.find((item) => item.id === selectedItem.value?.id)

    if (!cut) {
      return
    }

    const nextHole = normalizeHole(row, col)
    const occupied = board.value.cuts.some(
      (item) => item.id !== cut.id && item.row === nextHole.row && item.col === nextHole.col,
    )

    if (occupied) {
      return
    }

    cut.row = nextHole.row
    cut.col = nextHole.col
  }

  function moveSelectedComponent(row: number, col: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const nextHole = normalizeHole(row, col)
    const nextComponent = {
      ...component,
      row: nextHole.row,
      col: nextHole.col,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.row = nextHole.row
    component.col = nextHole.col
  }

  function moveSelectedWire(row: number, col: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'wire') {
      return
    }

    const wire = board.value.wires.find((item) => item.id === selectedItem.value?.id)

    if (!wire) {
      return
    }

    const nextHole = normalizeHole(row, col)
    const occupied = board.value.wires.some(
      (item) => item.id !== wire.id && item.row === nextHole.row && item.col === nextHole.col,
    )

    if (occupied) {
      return
    }

    wire.row = nextHole.row
    wire.col = nextHole.col
  }

  function moveSelectedLink(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'link') {
      return
    }

    const link = board.value.links.find((item) => item.id === selectedItem.value?.id)

    if (!link) {
      return
    }

    const nextFrom = normalizeHole(fromRow, fromCol)
    const nextTo = normalizeHole(toRow, toCol)

    if (nextFrom.row === nextTo.row && nextFrom.col === nextTo.col) {
      return
    }

    const duplicate = board.value.links.some(
      (item) =>
        item.id !== link.id &&
        item.fromRow === nextFrom.row &&
        item.fromCol === nextFrom.col &&
        item.toRow === nextTo.row &&
        item.toCol === nextTo.col,
    )

    if (duplicate) {
      return
    }

    link.fromRow = nextFrom.row
    link.fromCol = nextFrom.col
    link.toRow = nextTo.row
    link.toCol = nextTo.col
  }

  function updateSelectedComponentRefDes(refDes: string) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    component.refDes = refDes.trim() || component.refDes
  }

  function updateSelectedComponentValue(value: string) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    component.value = value
  }

  function updateSelectedComponentRotation(rotation: PlacedComponent['rotation']) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const nextComponent = {
      ...component,
      rotation,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.rotation = rotation
  }

  function updateSelectedComponentLeadPitch(leadPitch: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style === 'dip') {
      return
    }

    const nextComponent = {
      ...component,
      leadPitch,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.leadPitch = getLeadPitch(nextComponent) ?? footprint.defaultLeadPitch
  }

  function updateSelectedComponentPolarityMarked(polarityMarked: boolean) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style !== 'axial' && footprint.style !== 'radial') {
      return
    }

    component.polarityMarked = polarityMarked
  }

  function updateSelectedComponentTwoLeadStyle(style: 'axial' | 'radial' | 'single-row') {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)
    const isSingleRowTwoLead =
      footprint.style === 'dip' && getPinLayout(component) === 'single-row' && (getDipPinCount(component) ?? 0) <= 2

    if (!isSingleRowTwoLead && footprint.style === 'dip') {
      return
    }

    if (style === 'single-row') {
      if (isSingleRowTwoLead) {
        return
      }

      const singleRowFootprint = footprintCatalog.find((item) => item.style === 'dip')

      if (!singleRowFootprint) {
        return
      }

      const nextComponent: PlacedComponent = {
        ...component,
        footprintId: singleRowFootprint.id,
        dipPins: 2,
        dipWidth: singleRowFootprint.defaultDipWidth,
        pinLayout: 'single-row',
        leadPitch: undefined,
        bodyRadius: undefined,
      }

      if (!isComponentWithinBoard(nextComponent)) {
        return
      }

      component.footprintId = singleRowFootprint.id
      component.dipPins = 2
      component.dipWidth = singleRowFootprint.defaultDipWidth
      component.pinLayout = 'single-row'
      component.leadPitch = undefined
      component.bodyRadius = undefined
      return
    }

    if (!isSingleRowTwoLead && footprint.style === style) {
      return
    }

    const targetFootprint = footprintCatalog.find((item) => item.style === style)

    if (!targetFootprint) {
      return
    }

    const nextComponent: PlacedComponent = {
      ...component,
      footprintId: targetFootprint.id,
      rotation: style === 'axial' ? defaultRotationForFootprint(targetFootprint.id) : component.rotation,
      leadPitch: targetFootprint.defaultLeadPitch,
      bodyRadius: targetFootprint.defaultBodyRadius,
      dipPins: undefined,
      dipWidth: undefined,
      pinLayout: undefined,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.footprintId = targetFootprint.id
    component.rotation = style === 'axial' ? defaultRotationForFootprint(targetFootprint.id) : component.rotation
    component.leadPitch = targetFootprint.defaultLeadPitch
    component.bodyRadius = targetFootprint.defaultBodyRadius
    component.dipPins = undefined
    component.dipWidth = undefined
    component.pinLayout = undefined
  }

  function updateSelectedComponentBodyRadius(bodyRadius: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style !== 'radial') {
      return
    }

    const nextComponent = {
      ...component,
      bodyRadius,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.bodyRadius = getBodyRadius(nextComponent) ?? footprint.defaultBodyRadius
  }

  function updateSelectedComponentDipPins(dipPins: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style !== 'dip') {
      return
    }

    const nextComponent = {
      ...component,
      dipPins,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.dipPins = getDipPinCount(nextComponent) ?? footprint.defaultDipPins
  }

  function updateSelectedComponentPinLayout(pinLayout: PinLayout) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style !== 'dip') {
      return
    }

    const normalizedLayout: PinLayout = pinLayout === 'single-row' ? 'single-row' : 'dual-row'

    if (getPinLayout(component) === normalizedLayout) {
      return
    }

    const nextComponent = {
      ...component,
      pinLayout: normalizedLayout,
      dipPins: component.dipPins ?? footprint.defaultDipPins,
    }

    nextComponent.dipPins = getDipPinCount(nextComponent) ?? footprint.defaultDipPins

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.pinLayout = normalizedLayout
    component.dipPins = nextComponent.dipPins
  }

  function updateSelectedComponentDipWidth(dipWidth: number) {
    if (!selectedItem.value || selectedItem.value.kind !== 'component') {
      return
    }

    const component = board.value.components.find((item) => item.id === selectedItem.value?.id)

    if (!component) {
      return
    }

    const footprint = getFootprint(component.footprintId)

    if (footprint.style !== 'dip') {
      return
    }

    const nextComponent = {
      ...component,
      dipWidth,
    }

    if (!isComponentWithinBoard(nextComponent)) {
      return
    }

    component.dipWidth = getDipWidth(nextComponent) ?? footprint.defaultDipWidth
  }

  function cancelPendingPlacement() {
    pendingLinkStart.value = null
    activeTool.value = 'inspect'
  }

  function setStorageMode(mode: StorageMode) {
    board.value.storageMode = mode

    if (mode === 'local') {
      cloudProjectId.value = null
      cloudSaveState.value = 'idle'
      cloudSaveError.value = null
      cloudShareToken.value = null
      cloudShareEnabled.value = false
    }
  }

  async function loadCloudProject(projectId: string) {
    cloudProjectId.value = projectId

    if (!cloudEnabled.value) {
      suppressNextCloudAutosave = true
      board.value = {
        ...createBoardState('cloud'),
        projectName: `Cloud Project ${projectId}`,
      }
      cloudSaveState.value = 'queued'
      cloudSaveError.value = 'Firebase is not configured. Set VITE_FIREBASE_* values to enable cloud sync.'
      return
    }

    cloudSaveState.value = 'saving'
    cloudSaveError.value = null

    try {
      const cloudProject = await loadCloudProjectById(projectId)

      suppressNextCloudAutosave = true
      board.value = {
        ...cloudProject.board,
        storageMode: 'cloud',
        projectName: cloudProject.name || cloudProject.board.projectName,
      }
      cloudShareToken.value = cloudProject.shareToken ?? null
      cloudShareEnabled.value = Boolean(cloudProject.shareEnabled)
      cloudSaveState.value = 'saved'
      void flushCloudQueue()
    } catch (error) {
      suppressNextCloudAutosave = true
      board.value = {
        ...createBoardState('cloud'),
        projectName: `Cloud Project ${projectId}`,
      }
      cloudSaveState.value = 'error'
      cloudSaveError.value = error instanceof Error ? error.message : 'Unable to load cloud project.'
      cloudShareToken.value = null
      cloudShareEnabled.value = false
    }
  }

  async function enableShareLink() {
    if (!cloudProjectId.value) {
      throw new Error('Open a cloud project before enabling sharing.')
    }

    const token = await enableCloudProjectShare(cloudProjectId.value)
    cloudShareEnabled.value = true
    cloudShareToken.value = token
    return token
  }

  async function disableShareLink() {
    if (!cloudProjectId.value) {
      return
    }

    await disableCloudProjectShare(cloudProjectId.value)
    cloudShareEnabled.value = false
    cloudShareToken.value = null
  }

  function clearGuestCopy() {
    clearGuestSession()
    board.value = createBoardState('local')
    cloudProjectId.value = null
    cloudSaveState.value = 'idle'
    cloudSaveError.value = null
    cloudShareToken.value = null
    cloudShareEnabled.value = false
  }

  function toggleRatsnest() {
    showRatsnest.value = !showRatsnest.value
  }

  function setShowRatsnest(visible: boolean) {
    showRatsnest.value = visible
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      online.value = true
      void flushCloudQueue()
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
        return
      }

      if (suppressNextCloudAutosave) {
        suppressNextCloudAutosave = false
        return
      }

      scheduleCloudAutosave()
    },
    { deep: true },
  )

  return {
    board,
    counts,
    online,
    showRatsnest,
    activeTool,
    activeFootprintId,
    activeWireType,
    pendingLinkStart,
    selectedItem,
    cloudProjectId,
    cloudSaveState,
    cloudSaveError,
    cloudQueuedWrites,
    cloudEnabled,
    cloudShareToken,
    cloudShareEnabled,
    resetBoard,
    resizeBoard,
    cropBoard,
    setSelectedItem,
    setActiveFootprint,
    renameProject,
    setNetlist,
    importKiCadNetlist,
    setActiveTool,
    setActiveWireType,
    toggleCut,
    placeAtHole,
    inspectAtHole,
    deleteSelected,
    updateSelectedLinkColor,
    moveSelectedComponent,
    moveSelectedCut,
    moveSelectedWire,
    moveSelectedLink,
    updateSelectedComponentRefDes,
    updateSelectedComponentBodyRadius,
    updateSelectedComponentDipPins,
    updateSelectedComponentDipWidth,
    updateSelectedComponentPinLayout,
    updateSelectedComponentPolarityMarked,
    updateSelectedComponentTwoLeadStyle,
    updateSelectedComponentLeadPitch,
    updateSelectedComponentValue,
    updateSelectedComponentRotation,
    updateSelectedWireSignalName,
    updateSelectedWireType,
    updateSelectedWireNote,
    cancelPendingPlacement,
    setStorageMode,
    toggleRatsnest,
    setShowRatsnest,
    loadCloudProject,
    flushCloudQueue,
    setCloudOwner,
    enableShareLink,
    disableShareLink,
    clearGuestCopy,
  }
})