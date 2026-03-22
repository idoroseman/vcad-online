<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  STRIPBOARD_HOLE_PITCH_MM,
  getAxialBodyGeometry,
  getComponentBounds,
  getComponentPinHoles,
  getFootprint,
  getRadialBodyGeometry,
} from '../../lib/footprints'
import { computeRatsnest } from '../../lib/connectivity'
import type { ActiveTool, BoardState, WireType } from '../../lib/types'

type SelectedItem = { kind: 'cut' | 'component' | 'link' | 'wire'; id: string } | null

type DragState =
  | {
      kind: 'component'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
    }
  | {
      kind: 'cut'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
    }
  | {
      kind: 'wire'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
    }
  | {
      kind: 'link-from'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
      start: { fromRow: number; fromCol: number; toRow: number; toCol: number }
    }
  | {
      kind: 'link-to'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
      start: { fromRow: number; fromCol: number; toRow: number; toCol: number }
    }
  | {
      kind: 'link'
      pointerId: number
      originHole: { row: number; col: number }
      lastHole: { row: number; col: number }
      start: { fromRow: number; fromCol: number; toRow: number; toCol: number }
    }

const props = defineProps<{
  board: BoardState
  activeTool: ActiveTool
  activeFootprintId: string
  activeWireType: WireType
  pendingLinkStart: { row: number; col: number } | null
  selectedItem: SelectedItem
}>()

const emit = defineEmits<{
  placeHole: [row: number, col: number]
  setFootprint: [footprintId: string]
  setTool: [tool: ActiveTool]
  inspectHole: [row: number, col: number]
  moveSelectedComponent: [row: number, col: number]
  moveSelectedCut: [row: number, col: number]
  moveSelectedLink: [fromRow: number, fromCol: number, toRow: number, toCol: number]
  moveSelectedWire: [row: number, col: number]
  selectItem: [item: SelectedItem]
}>()

const pitch = 18
const boardWidth = computed(() => (props.board.cols - 1) * pitch + 64)
const boardHeight = computed(() => (props.board.rows - 1) * pitch + 64)

const rows = computed(() => Array.from({ length: props.board.rows }, (_, index) => index))
const cols = computed(() => Array.from({ length: props.board.cols }, (_, index) => index))
const holes = computed(() =>
  rows.value.flatMap((row) => cols.value.map((col) => ({ row, col, key: `${row}-${col}` }))),
)
const ratsnestSegments = computed(() => computeRatsnest(props.board))
const stripSegments = computed(() => {
  const cutsByRow = new Map<number, number[]>()

  for (const cut of props.board.cuts) {
    const existing = cutsByRow.get(cut.row)

    if (existing) {
      existing.push(cut.col)
    } else {
      cutsByRow.set(cut.row, [cut.col])
    }
  }

  return rows.value.flatMap((row) => {
    const rowCuts = [...(cutsByRow.get(row) ?? [])].sort((a, b) => a - b)
    const segments: Array<{ key: string; row: number; startCol: number; endCol: number }> = []
    let startCol = 0

    for (const cutCol of rowCuts) {
      const endCol = cutCol - 1

      if (endCol >= startCol) {
        segments.push({ key: `${row}-${startCol}-${endCol}`, row, startCol, endCol })
      }

      startCol = cutCol + 1
    }

    if (startCol <= props.board.cols - 1) {
      segments.push({ key: `${row}-${startCol}-${props.board.cols - 1}`, row, startCol, endCol: props.board.cols - 1 })
    }

    return segments
  })
})
const svgElement = ref<SVGSVGElement | null>(null)
const addMenu = ref<HTMLDetailsElement | null>(null)
const cursorPosition = ref<{ row: number; col: number } | null>(null)
const dragState = ref<DragState | null>(null)
const suppressClick = ref(false)

const addOptions = [
  { label: 'Axial', footprintId: 'resistor-axial-7' },
  { label: 'Radial', footprintId: 'capacitor-radial-3' },
  { label: 'IC', footprintId: 'dip-8' },
]

function pointX(col: number) {
  return 32 + col * pitch
}

function pointY(row: number) {
  return 32 + row * pitch
}

function stripX(startCol: number) {
  return pointX(startCol) - 14
}

function stripWidth(startCol: number, endCol: number) {
  return (endCol - startCol) * pitch + 28
}

function wireColor(type: string) {
  switch (type) {
    case 'power':
      return '#dc2626'
    case 'gnd':
      return '#0f172a'
    case 'output':
      return '#2563eb'
    case 'bidirectional':
      return '#7c3aed'
    default:
      return '#d97706'
  }
}

function toolClasses(tool: ActiveTool) {
  return props.activeTool === tool
    ? 'inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-white'
    : 'inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-stone-700'
}

function addMenuClasses() {
  return props.activeTool === 'component'
    ? 'flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-white [&::-webkit-details-marker]:hidden'
    : 'flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-stone-700 [&::-webkit-details-marker]:hidden'
}

function selectAddOption(footprintId: string) {
  emit('setFootprint', footprintId)
  emit('setTool', 'component')

  if (addMenu.value) {
    addMenu.value.open = false
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay

  if (dx === 0 && dy === 0) {
    return distance(px, py, ax, ay)
  }

  const projection = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
  const nearestX = ax + projection * dx
  const nearestY = ay + projection * dy

  return distance(px, py, nearestX, nearestY)
}

function linkControlPoint(link: { fromRow: number; fromCol: number; toRow: number; toCol: number }) {
  return {
    x: (pointX(link.fromCol) + pointX(link.toCol)) / 2,
    y: Math.min(pointY(link.fromRow), pointY(link.toRow)) - 18,
  }
}

function distanceToLinkPath(x: number, y: number, link: { fromRow: number; fromCol: number; toRow: number; toCol: number }) {
  const startX = pointX(link.fromCol)
  const startY = pointY(link.fromRow)
  const endX = pointX(link.toCol)
  const endY = pointY(link.toRow)
  const control = linkControlPoint(link)
  let best = Number.POSITIVE_INFINITY
  let previousX = startX
  let previousY = startY

  for (let step = 1; step <= 18; step += 1) {
    const t = step / 18
    const inverse = 1 - t
    const sampleX = inverse * inverse * startX + 2 * inverse * t * control.x + t * t * endX
    const sampleY = inverse * inverse * startY + 2 * inverse * t * control.y + t * t * endY

    best = Math.min(best, distanceToSegment(x, y, previousX, previousY, sampleX, sampleY))
    previousX = sampleX
    previousY = sampleY
  }

  return best
}

function clientPointToBoardPoint(clientX: number, clientY: number) {
  if (!svgElement.value) {
    return null
  }

  const matrix = svgElement.value.getScreenCTM()

  if (!matrix) {
    return null
  }

  const point = svgElement.value.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const svgPoint = point.matrixTransform(matrix.inverse())

  return {
    x: svgPoint.x,
    y: svgPoint.y,
    row: Math.max(0, Math.min(props.board.rows - 1, Math.round((svgPoint.y - 32) / pitch))),
    col: Math.max(0, Math.min(props.board.cols - 1, Math.round((svgPoint.x - 32) / pitch))),
  }
}

function findItemAtPoint(x: number, y: number, row: number, col: number): SelectedItem {
  const component = props.board.components.find((item) => {
    const bounds = getComponentBounds(item)
    const minX = pointX(bounds.minCol) - 14
    const maxX = pointX(bounds.maxCol) + 14
    const minY = pointY(bounds.minRow) - 14
    const maxY = pointY(bounds.maxRow) + 14

    return x >= minX && x <= maxX && y >= minY && y <= maxY
  })

  if (component) {
    return { kind: 'component', id: component.id }
  }

  const cut = props.board.cuts.find((item) => distance(x, y, pointX(item.col), pointY(item.row)) <= 10)

  if (cut) {
    return { kind: 'cut', id: cut.id }
  }

  const wire = props.board.wires.find((item) => {
    const holeX = pointX(item.col)
    const holeY = pointY(item.row)

    return (
      distance(x, y, holeX, holeY - 28) <= 9 ||
      distance(x, y, holeX, holeY) <= 8 ||
      (Math.abs(x - holeX) <= 6 && y <= holeY && y >= holeY - 28)
    )
  })

  if (wire) {
    return { kind: 'wire', id: wire.id }
  }

  const link = props.board.links.find((item) => {
    const startHit = distance(x, y, pointX(item.fromCol), pointY(item.fromRow)) <= 8
    const endHit = distance(x, y, pointX(item.toCol), pointY(item.toRow)) <= 8

    return startHit || endHit || distanceToLinkPath(x, y, item) <= 8
  })

  if (link) {
    return { kind: 'link', id: link.id }
  }

  const holeHit = props.board.cuts.find((item) => item.row === row && item.col === col)
  if (holeHit) {
    return { kind: 'cut', id: holeHit.id }
  }

  return null
}

function findLinkHandleAtPoint(x: number, y: number) {
  for (const link of props.board.links) {
    if (distance(x, y, pointX(link.fromCol), pointY(link.fromRow)) <= 8) {
      return { id: link.id, end: 'from' as const }
    }

    if (distance(x, y, pointX(link.toCol), pointY(link.toRow)) <= 8) {
      return { id: link.id, end: 'to' as const }
    }
  }

  return null
}

function updateCursorPosition(event: PointerEvent) {
  const hole = clientPointToHole(event.clientX, event.clientY)

  if (!hole) {
    return
  }

  cursorPosition.value = hole

  if (props.activeTool !== 'inspect' || !dragState.value || dragState.value.pointerId !== event.pointerId) {
    return
  }

  if (hole.row === dragState.value.lastHole.row && hole.col === dragState.value.lastHole.col) {
    return
  }

  dragState.value.lastHole = hole

  if (dragState.value.kind === 'cut') {
    emit('moveSelectedCut', hole.row, hole.col)
    suppressClick.value = true
    return
  }

  if (dragState.value.kind === 'component') {
    emit('moveSelectedComponent', hole.row, hole.col)
    suppressClick.value = true
    return
  }

  if (dragState.value.kind === 'wire') {
    emit('moveSelectedWire', hole.row, hole.col)
    suppressClick.value = true
    return
  }

  if (dragState.value.kind === 'link-from') {
    emit(
      'moveSelectedLink',
      hole.row,
      hole.col,
      dragState.value.start.toRow,
      dragState.value.start.toCol,
    )
    suppressClick.value = true
    return
  }

  if (dragState.value.kind === 'link-to') {
    emit(
      'moveSelectedLink',
      dragState.value.start.fromRow,
      dragState.value.start.fromCol,
      hole.row,
      hole.col,
    )
    suppressClick.value = true
    return
  }

  const minDeltaRow = -Math.min(dragState.value.start.fromRow, dragState.value.start.toRow)
  const maxDeltaRow = props.board.rows - 1 - Math.max(dragState.value.start.fromRow, dragState.value.start.toRow)
  const minDeltaCol = -Math.min(dragState.value.start.fromCol, dragState.value.start.toCol)
  const maxDeltaCol = props.board.cols - 1 - Math.max(dragState.value.start.fromCol, dragState.value.start.toCol)
  const deltaRow = clamp(hole.row - dragState.value.originHole.row, minDeltaRow, maxDeltaRow)
  const deltaCol = clamp(hole.col - dragState.value.originHole.col, minDeltaCol, maxDeltaCol)

  emit(
    'moveSelectedLink',
    dragState.value.start.fromRow + deltaRow,
    dragState.value.start.fromCol + deltaCol,
    dragState.value.start.toRow + deltaRow,
    dragState.value.start.toCol + deltaCol,
  )
  suppressClick.value = true
}

function clearCursorPosition() {
  cursorPosition.value = null
}

function clientPointToHole(clientX: number, clientY: number) {
  const point = clientPointToBoardPoint(clientX, clientY)

  if (!point) {
    return null
  }

  return { row: point.row, col: point.col }
}

function handlePointerDown(event: PointerEvent) {
  if (props.activeTool !== 'inspect' || event.button !== 0) {
    return
  }

  const point = clientPointToBoardPoint(event.clientX, event.clientY)

  if (!point) {
    return
  }

  const item = findItemAtPoint(point.x, point.y, point.row, point.col)
  const linkHandle = findLinkHandleAtPoint(point.x, point.y)

  if (!item) {
    return
  }

  emit('selectItem', item)

  if (item.kind === 'component') {
    dragState.value = {
      kind: 'component',
      pointerId: event.pointerId,
      originHole: { row: point.row, col: point.col },
      lastHole: { row: point.row, col: point.col },
    }
  }

  if (item.kind === 'cut') {
    dragState.value = {
      kind: 'cut',
      pointerId: event.pointerId,
      originHole: { row: point.row, col: point.col },
      lastHole: { row: point.row, col: point.col },
    }
  }

  if (item.kind === 'wire') {
    dragState.value = {
      kind: 'wire',
      pointerId: event.pointerId,
      originHole: { row: point.row, col: point.col },
      lastHole: { row: point.row, col: point.col },
    }
  }

  if (item.kind === 'link') {
    const link = props.board.links.find((entry) => entry.id === item.id)

    if (!link) {
      return
    }

    const baseState = {
      pointerId: event.pointerId,
      originHole: { row: point.row, col: point.col },
      lastHole: { row: point.row, col: point.col },
      start: {
        fromRow: link.fromRow,
        fromCol: link.fromCol,
        toRow: link.toRow,
        toCol: link.toCol,
      },
    }

    if (linkHandle?.id === link.id && linkHandle.end === 'from') {
      dragState.value = {
        kind: 'link-from',
        ...baseState,
      }
      svgElement.value?.setPointerCapture(event.pointerId)
      return
    }

    if (linkHandle?.id === link.id && linkHandle.end === 'to') {
      dragState.value = {
        kind: 'link-to',
        ...baseState,
      }
      svgElement.value?.setPointerCapture(event.pointerId)
      return
    }

    dragState.value = {
      kind: 'link',
      ...baseState,
    }
  }

  svgElement.value?.setPointerCapture(event.pointerId)
}

function clearDragState(pointerId?: number) {
  if (!dragState.value) {
    return
  }

  if (pointerId !== undefined && dragState.value.pointerId !== pointerId) {
    return
  }

  if (svgElement.value?.hasPointerCapture(dragState.value.pointerId)) {
    svgElement.value.releasePointerCapture(dragState.value.pointerId)
  }

  dragState.value = null
}

function handlePointerUp(event: PointerEvent) {
  clearDragState(event.pointerId)
}

function handlePointerCancel(event: PointerEvent) {
  clearDragState(event.pointerId)
}

function handleBoardClick(event: MouseEvent) {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }

  const hole = clientPointToHole(event.clientX, event.clientY)

  const point = clientPointToBoardPoint(event.clientX, event.clientY)

  if (!hole || !point) {
    return
  }

  if (props.activeTool === 'inspect') {
    const item = findItemAtPoint(point.x, point.y, hole.row, hole.col)

    if (item) {
      emit('selectItem', item)
      return
    }

    emit('inspectHole', hole.row, hole.col)
    return
  }

  emit('placeHole', hole.row, hole.col)
}

function isSelected(kind: 'cut' | 'component' | 'link' | 'wire', id: string) {
  return props.selectedItem?.kind === kind && props.selectedItem?.id === id
}

function axialAngle(component: BoardState['components'][number]) {
  return component.rotation % 2 === 0 ? 0 : 90
}

function radialRadiusPx(component: BoardState['components'][number]) {
  const body = getRadialBodyGeometry(component)

  if (!body) {
    return 0
  }

  return (body.radiusMm / STRIPBOARD_HOLE_PITCH_MM) * pitch
}

function radialLeadEnd(component: BoardState['components'][number], pinIndex: number) {
  const body = getRadialBodyGeometry(component)

  if (!body) {
    return null
  }

  const leadEntry = body.leadEntries[pinIndex]

  if (!leadEntry) {
    return null
  }

  return {
    x: pointX(leadEntry.col),
    y: pointY(leadEntry.row),
  }
}

function dipBodyRect(component: BoardState['components'][number]) {
  if (getFootprint(component.footprintId).style !== 'dip') {
    return null
  }

  const bounds = getComponentBounds(component)
  const minX = pointX(bounds.minCol)
  const maxX = pointX(bounds.maxCol)
  const minY = pointY(bounds.minRow)
  const maxY = pointY(bounds.maxRow)
  const spanX = maxX - minX
  const spanY = maxY - minY

  if (spanY >= spanX) {
    return {
      x: minX + pitch * 0.52,
      y: minY - pitch * 0.5,
      width: Math.max(spanX - pitch * 1.04, pitch * 1.45),
      height: spanY + pitch,
    }
  }

  return {
    x: minX - pitch * 0.5,
    y: minY + pitch * 0.52,
    width: spanX + pitch,
    height: Math.max(spanY - pitch * 1.04, pitch * 1.45),
  }
}

function dipPinAnchor(component: BoardState['components'][number], pin: { row: number; col: number }) {
  const rect = dipBodyRect(component)

  if (!rect) {
    return null
  }

  const px = pointX(pin.col)
  const py = pointY(pin.row)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2

  if (component.rotation % 2 === 0) {
    return {
      x: px < cx ? rect.x : rect.x + rect.width,
      y: py,
    }
  }

  return {
    x: px,
    y: py < cy ? rect.y : rect.y + rect.height,
  }
}

function dipPinOneMarker(component: BoardState['components'][number]) {
  const rect = dipBodyRect(component)
  const pin = getComponentPinHoles(component)[0]
  const anchor = pin ? dipPinAnchor(component, pin) : null

  if (!rect || !pin || !anchor) {
    return null
  }

  const inset = 6

  if (Math.abs(anchor.x - rect.x) < 0.5) {
    return {
      x: anchor.x + inset,
      y: anchor.y,
    }
  }

  if (Math.abs(anchor.x - (rect.x + rect.width)) < 0.5) {
    return {
      x: anchor.x - inset,
      y: anchor.y,
    }
  }

  if (Math.abs(anchor.y - rect.y) < 0.5) {
    return {
      x: anchor.x,
      y: anchor.y + inset,
    }
  }

  return {
    x: anchor.x,
    y: anchor.y - inset,
  }
}
</script>

<template>
  <div class="h-full rounded-[30px] border border-black/10 bg-white/70 p-3 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.5)] backdrop-blur sm:p-5">
    <div class="flex h-full flex-col rounded-[24px] bg-[radial-gradient(circle_at_top,#fff7ed,transparent_28%),linear-gradient(180deg,#fde68a_0%,#f3e2a6_100%)] p-3 sm:p-4">
      <div class="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3 overflow-visible text-xs uppercase tracking-[0.24em] text-stone-600">
        <div class="flex min-w-0 flex-wrap items-center gap-2 overflow-visible">
          <button :class="toolClasses('inspect')" @click="emit('setTool', 'inspect')">
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" stroke-linecap="round" />
            </svg>
            <span>Inspect</span>
          </button>
          <button :class="toolClasses('cut')" @click="emit('setTool', 'cut')">
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="4.5" cy="4.5" r="2.2" />
              <circle cx="11.5" cy="11.5" r="2.2" />
              <path d="M6.1 6.1L14 14" stroke-linecap="round" />
              <path d="M9.8 6.2L14 2" stroke-linecap="round" />
            </svg>
            <span>Cut</span>
          </button>
          <button :class="toolClasses('link')" @click="emit('setTool', 'link')">
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="3.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12.5" cy="3.5" r="1.5" fill="currentColor" stroke="none" />
              <path d="M4.8 11.2C6.4 9.6 8.1 7.9 11.2 4.8" stroke-linecap="round" />
            </svg>
            <span>Link</span>
          </button>
          <button :class="toolClasses('wire')" @click="emit('setTool', 'wire')">
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M8 2V10" stroke-linecap="round" />
              <circle cx="8" cy="12.3" r="2.3" />
              <path d="M5.5 2H10.5" stroke-linecap="round" />
            </svg>
            <span>Wire</span>
          </button>
          <details ref="addMenu" class="relative overflow-visible">
            <summary :class="addMenuClasses()">
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M8 3V13" stroke-linecap="round" />
                <path d="M3 8H13" stroke-linecap="round" />
              </svg>
              <span>Add</span>
              <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M4 6L8 10L12 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </summary>
            <div class="absolute left-0 top-full z-20 mt-2 min-w-32 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)]">
              <button
                v-for="option in addOptions"
                :key="option.footprintId"
                class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
                @click.prevent="selectAddOption(option.footprintId)"
              >
                <span>{{ option.label }}</span>
                <span v-if="activeFootprintId === option.footprintId && activeTool === 'component'" class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Active
                </span>
              </button>
            </div>
          </details>
        </div>

        <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 overflow-visible text-right">
          <span v-if="cursorPosition" class="whitespace-nowrap rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-stone-50">
            R {{ cursorPosition.row }} · C {{ cursorPosition.col }}
          </span>
          <span class="whitespace-nowrap">{{ board.rows }} rows · {{ board.cols }} columns</span>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto rounded-[20px] border border-black/10 bg-[#f4ecce]">
        <div class="min-h-full min-w-full p-3">
          <svg
            ref="svgElement"
            :viewBox="`0 0 ${boardWidth} ${boardHeight}`"
            :width="boardWidth"
            :height="boardHeight"
            preserveAspectRatio="xMinYMin meet"
            class="block"
            :class="activeTool === 'inspect' ? (dragState ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-cell'"
            @click="handleBoardClick"
            @pointercancel="handlePointerCancel"
            @pointerdown="handlePointerDown"
            @pointerleave="clearCursorPosition"
            @pointermove="updateCursorPosition"
            @pointerup="handlePointerUp"
          >
          <rect x="0" y="0" :width="boardWidth" :height="boardHeight" fill="#efe0a8" />

          <g>
            <rect
              v-for="segment in stripSegments"
              :key="segment.key"
              :x="stripX(segment.startCol)"
              :y="pointY(segment.row) - 5"
              :width="stripWidth(segment.startCol, segment.endCol)"
              height="10"
              rx="5"
              fill="#bc6c25"
              opacity="0.78"
            />
          </g>

          <g>
            <circle
              v-for="hole in holes"
              :key="hole.key"
              :cx="pointX(hole.col)"
              :cy="pointY(hole.row)"
              r="3.4"
              fill="#3b2f1e"
              opacity="0.9"
            />
          </g>

          <g v-if="cursorPosition">
            <circle
              :cx="pointX(cursorPosition.col)"
              :cy="pointY(cursorPosition.row)"
              r="7"
              fill="none"
              stroke="#0f172a"
              stroke-width="1.5"
              opacity="0.45"
            />
            <circle
              :cx="pointX(cursorPosition.col)"
              :cy="pointY(cursorPosition.row)"
              r="4.6"
              fill="none"
              stroke="#f97316"
              stroke-width="1.5"
            />
          </g>

          <g v-if="pendingLinkStart">
            <circle
              :cx="pointX(pendingLinkStart.col)"
              :cy="pointY(pendingLinkStart.row)"
              r="8.5"
              fill="none"
              stroke="#0284c7"
              stroke-width="2"
              stroke-dasharray="4 3"
            />
          </g>

          <g>
            <g v-for="component in board.components" :key="component.id">
              <g v-for="(pin, index) in getComponentPinHoles(component)" :key="`${component.id}-pin-${index}`">
                <circle
                  :cx="pointX(pin.col)"
                  :cy="pointY(pin.row)"
                  :r="isSelected('component', component.id) ? 5.2 : 4.2"
                  :fill="getFootprint(component.footprintId).style === 'dip' && index === 0 ? '#f97316' : '#fff7ed'"
                  :stroke="getFootprint(component.footprintId).style === 'dip' && index === 0 ? '#7c2d12' : isSelected('component', component.id) ? '#0f172a' : '#57534e'"
                  stroke-width="1.4"
                />
              </g>

              <g>
                <template v-if="getFootprint(component.footprintId).style === 'axial' && getAxialBodyGeometry(component)">
                  <line
                    :x1="pointX(getComponentPinHoles(component)[0].col)"
                    :y1="pointY(getComponentPinHoles(component)[0].row)"
                    :x2="pointX(getAxialBodyGeometry(component)!.bodyStart.col)"
                    :y2="pointY(getAxialBodyGeometry(component)!.bodyStart.row)"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#6b7280'"
                    stroke-width="2.2"
                    stroke-linecap="round"
                  />
                  <line
                    :x1="pointX(getAxialBodyGeometry(component)!.bodyEnd.col)"
                    :y1="pointY(getAxialBodyGeometry(component)!.bodyEnd.row)"
                    :x2="pointX(getComponentPinHoles(component)[1].col)"
                    :y2="pointY(getComponentPinHoles(component)[1].row)"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#6b7280'"
                    stroke-width="2.2"
                    stroke-linecap="round"
                  />
                  <rect
                    :x="(pointX(getAxialBodyGeometry(component)!.bodyStart.col) + pointX(getAxialBodyGeometry(component)!.bodyEnd.col)) / 2 - (3 * pitch) / 2"
                    :y="(pointY(getAxialBodyGeometry(component)!.bodyStart.row) + pointY(getAxialBodyGeometry(component)!.bodyEnd.row)) / 2 - pitch * 0.52"
                    :width="3 * pitch"
                    :height="pitch * 1.04"
                    :rx="pitch * 0.52"
                    :fill="isSelected('component', component.id) ? '#1f2937' : '#f5f5f4'"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#44403c'"
                    stroke-width="1.6"
                    opacity="0.97"
                    :transform="`rotate(${axialAngle(component)} ${(pointX(getAxialBodyGeometry(component)!.bodyStart.col) + pointX(getAxialBodyGeometry(component)!.bodyEnd.col)) / 2} ${(pointY(getAxialBodyGeometry(component)!.bodyStart.row) + pointY(getAxialBodyGeometry(component)!.bodyEnd.row)) / 2})`"
                  />
                </template>
                <template v-else-if="getFootprint(component.footprintId).style === 'radial' && getRadialBodyGeometry(component)">
                  <line
                    :x1="pointX(getComponentPinHoles(component)[0].col)"
                    :y1="pointY(getComponentPinHoles(component)[0].row)"
                    :x2="radialLeadEnd(component, 0)?.x ?? pointX(getComponentPinHoles(component)[0].col)"
                    :y2="radialLeadEnd(component, 0)?.y ?? pointY(getComponentPinHoles(component)[0].row)"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#6b7280'"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <line
                    :x1="pointX(getComponentPinHoles(component)[1].col)"
                    :y1="pointY(getComponentPinHoles(component)[1].row)"
                    :x2="radialLeadEnd(component, 1)?.x ?? pointX(getComponentPinHoles(component)[1].col)"
                    :y2="radialLeadEnd(component, 1)?.y ?? pointY(getComponentPinHoles(component)[1].row)"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#6b7280'"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <circle
                    :cx="pointX(getRadialBodyGeometry(component)!.center.col)"
                    :cy="pointY(getRadialBodyGeometry(component)!.center.row)"
                    :r="radialRadiusPx(component)"
                    :fill="isSelected('component', component.id) ? '#1f2937' : '#f5f5f4'"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#44403c'"
                    stroke-width="1.6"
                    opacity="0.97"
                  />
                  <circle
                    :cx="radialLeadEnd(component, 0)?.x ?? pointX(getComponentPinHoles(component)[0].col)"
                    :cy="radialLeadEnd(component, 0)?.y ?? pointY(getComponentPinHoles(component)[0].row)"
                    r="3.1"
                    :fill="isSelected('component', component.id) ? '#fde68a' : '#f8fafc'"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#475569'"
                    stroke-width="1.2"
                  />
                  <circle
                    :cx="radialLeadEnd(component, 1)?.x ?? pointX(getComponentPinHoles(component)[1].col)"
                    :cy="radialLeadEnd(component, 1)?.y ?? pointY(getComponentPinHoles(component)[1].row)"
                    r="3.1"
                    :fill="isSelected('component', component.id) ? '#fde68a' : '#f8fafc'"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#475569'"
                    stroke-width="1.2"
                  />
                </template>
                <template v-else-if="getFootprint(component.footprintId).style === 'dip' && dipBodyRect(component)">
                  <line
                    v-for="(pin, index) in getComponentPinHoles(component)"
                    :key="`${component.id}-dip-lead-${index}`"
                    :x1="pointX(pin.col)"
                    :y1="pointY(pin.row)"
                    :x2="dipPinAnchor(component, pin)?.x ?? pointX(pin.col)"
                    :y2="dipPinAnchor(component, pin)?.y ?? pointY(pin.row)"
                    :stroke="index === 0 ? '#f97316' : isSelected('component', component.id) ? '#ea580c' : '#6b7280'"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <rect
                    :x="dipBodyRect(component)!.x"
                    :y="dipBodyRect(component)!.y"
                    :width="dipBodyRect(component)!.width"
                    :height="dipBodyRect(component)!.height"
                    rx="7"
                    :fill="isSelected('component', component.id) ? '#1f2937' : '#f5f5f4'"
                    :stroke="isSelected('component', component.id) ? '#ea580c' : '#44403c'"
                    stroke-width="1.6"
                    opacity="0.97"
                  />
                  <circle
                    v-if="dipPinOneMarker(component)"
                    :cx="dipPinOneMarker(component)!.x"
                    :cy="dipPinOneMarker(component)!.y"
                    r="3.2"
                    fill="#f97316"
                    stroke="#7c2d12"
                    stroke-width="1"
                  />
                </template>
                <rect
                  v-else
                  :x="pointX(getComponentBounds(component).minCol) - 11"
                  :y="pointY(getComponentBounds(component).minRow) - 11"
                  :width="(getComponentBounds(component).maxCol - getComponentBounds(component).minCol) * pitch + 22"
                  :height="(getComponentBounds(component).maxRow - getComponentBounds(component).minRow) * pitch + 22"
                  rx="10"
                  :fill="isSelected('component', component.id) ? '#1f2937' : '#f5f5f4'"
                  :stroke="isSelected('component', component.id) ? '#ea580c' : '#44403c'"
                  stroke-width="1.6"
                  opacity="0.95"
                />
                <text
                  :x="(pointX(getComponentBounds(component).minCol) + pointX(getComponentBounds(component).maxCol)) / 2"
                  :y="(pointY(getComponentBounds(component).minRow) + pointY(getComponentBounds(component).maxRow)) / 2 - 2"
                  font-size="8.5"
                  font-weight="700"
                  text-anchor="middle"
                  :fill="isSelected('component', component.id) ? '#fef3c7' : '#1c1917'"
                >
                  {{ component.refDes }}
                </text>
                <text
                  :x="(pointX(getComponentBounds(component).minCol) + pointX(getComponentBounds(component).maxCol)) / 2"
                  :y="(pointY(getComponentBounds(component).minRow) + pointY(getComponentBounds(component).maxRow)) / 2 + 8"
                  font-size="7.5"
                  font-weight="600"
                  text-anchor="middle"
                  :fill="isSelected('component', component.id) ? '#fde68a' : '#57534e'"
                >
                  {{ component.value || getFootprint(component.footprintId).label }}
                </text>
              </g>
            </g>
          </g>

          <g v-if="ratsnestSegments.length" opacity="0.82">
            <g v-for="(segment, index) in ratsnestSegments" :key="`${segment.netName}-${segment.from.row}-${segment.from.col}-${segment.to.row}-${segment.to.col}-${index}`">
              <line
                :x1="pointX(segment.from.col)"
                :y1="pointY(segment.from.row)"
                :x2="pointX(segment.to.col)"
                :y2="pointY(segment.to.row)"
                stroke="#0ea5e9"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-dasharray="5 4"
              />
              <circle
                :cx="pointX(segment.from.col)"
                :cy="pointY(segment.from.row)"
                r="2.4"
                fill="#0ea5e9"
              />
              <circle
                :cx="pointX(segment.to.col)"
                :cy="pointY(segment.to.row)"
                r="2.4"
                fill="#0ea5e9"
              />
            </g>
          </g>

          <g>
            <g v-for="cut in board.cuts" :key="cut.id">
              <circle
                v-if="isSelected('cut', cut.id)"
                :cx="pointX(cut.col)"
                :cy="pointY(cut.row)"
                r="10.5"
                fill="none"
                stroke="#111827"
                stroke-width="1.6"
                opacity="0.75"
              />
              <circle
                :cx="pointX(cut.col)"
                :cy="pointY(cut.row)"
                r="7.5"
                fill="#fff7ed"
                stroke="#7f1d1d"
                stroke-width="1.6"
                opacity="0.95"
              />
              <line
                :x1="pointX(cut.col) - 5.8"
                :y1="pointY(cut.row) - 5.8"
                :x2="pointX(cut.col) + 5.8"
                :y2="pointY(cut.row) + 5.8"
                stroke="#dc2626"
                stroke-width="2.6"
                stroke-linecap="round"
              />
              <line
                :x1="pointX(cut.col) + 5.8"
                :y1="pointY(cut.row) - 5.8"
                :x2="pointX(cut.col) - 5.8"
                :y2="pointY(cut.row) + 5.8"
                stroke="#dc2626"
                stroke-width="2.6"
                stroke-linecap="round"
              />
            </g>
          </g>

          <g>
            <g v-for="link in board.links" :key="link.id">
              <path
                :d="`M ${pointX(link.fromCol)} ${pointY(link.fromRow)} Q ${(pointX(link.fromCol) + pointX(link.toCol)) / 2} ${Math.min(pointY(link.fromRow), pointY(link.toRow)) - 18} ${pointX(link.toCol)} ${pointY(link.toRow)}`"
                :stroke="isSelected('link', link.id) ? '#0f172a' : link.color ?? '#0f766e'"
                :stroke-width="isSelected('link', link.id) ? 5 : 3"
                fill="none"
                stroke-linecap="round"
              />
              <g v-if="isSelected('link', link.id)">
                <circle
                  :cx="pointX(link.fromCol)"
                  :cy="pointY(link.fromRow)"
                  r="7.5"
                  fill="#fff7ed"
                  stroke="#0f172a"
                  stroke-width="1.5"
                  opacity="0.96"
                />
                <circle
                  :cx="pointX(link.fromCol)"
                  :cy="pointY(link.fromRow)"
                  r="3"
                  :fill="dragState?.kind === 'link-from' ? '#ea580c' : '#0f172a'"
                />
                <circle
                  :cx="pointX(link.toCol)"
                  :cy="pointY(link.toRow)"
                  r="7.5"
                  fill="#fff7ed"
                  stroke="#0f172a"
                  stroke-width="1.5"
                  opacity="0.96"
                />
                <circle
                  :cx="pointX(link.toCol)"
                  :cy="pointY(link.toRow)"
                  r="3"
                  :fill="dragState?.kind === 'link-to' ? '#ea580c' : '#0f172a'"
                />
              </g>
            </g>
          </g>

          <g>
            <g v-for="wire in board.wires" :key="wire.id">
              <circle
                v-if="isSelected('wire', wire.id)"
                :cx="pointX(wire.col)"
                :cy="pointY(wire.row) - 28"
                r="10"
                fill="none"
                stroke="#111827"
                stroke-width="1.6"
                opacity="0.75"
              />
              <line
                :x1="pointX(wire.col)"
                :y1="pointY(wire.row)"
                :x2="pointX(wire.col)"
                :y2="pointY(wire.row) - 24"
                :stroke="wireColor(wire.type)"
                stroke-width="3"
                stroke-linecap="round"
              />
              <circle :cx="pointX(wire.col)" :cy="pointY(wire.row) - 28" r="5" :fill="wireColor(wire.type)" />
              <text
                :x="pointX(wire.col) + 8"
                :y="pointY(wire.row) - 24"
                font-size="9"
                font-weight="700"
                :fill="wireColor(wire.type)"
              >
                {{ wire.signalName }}
              </text>
            </g>
          </g>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>