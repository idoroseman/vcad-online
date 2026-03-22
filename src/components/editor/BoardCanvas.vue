<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ActiveTool, BoardState, WireType } from '../../lib/types'

const props = defineProps<{
  board: BoardState
  activeTool: ActiveTool
  activeWireType: WireType
  pendingLinkStart: { row: number; col: number } | null
}>()

const emit = defineEmits<{
  placeHole: [row: number, col: number]
  setTool: [tool: ActiveTool]
}>()

const pitch = 18
const boardWidth = computed(() => (props.board.cols - 1) * pitch + 64)
const boardHeight = computed(() => (props.board.rows - 1) * pitch + 64)

const rows = computed(() => Array.from({ length: props.board.rows }, (_, index) => index))
const cols = computed(() => Array.from({ length: props.board.cols }, (_, index) => index))
const holes = computed(() =>
  rows.value.flatMap((row) => cols.value.map((col) => ({ row, col, key: `${row}-${col}` }))),
)
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
const cursorPosition = ref<{ row: number; col: number } | null>(null)

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
    ? 'rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-white'
    : 'rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-stone-700'
}

function updateCursorPosition(event: PointerEvent) {
  if (!svgElement.value) {
    return
  }

  const matrix = svgElement.value.getScreenCTM()

  if (!matrix) {
    return
  }

  const point = svgElement.value.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const svgPoint = point.matrixTransform(matrix.inverse())

  const x = svgPoint.x
  const y = svgPoint.y
  const row = Math.max(0, Math.min(props.board.rows - 1, Math.round((y - 32) / pitch)))
  const col = Math.max(0, Math.min(props.board.cols - 1, Math.round((x - 32) / pitch)))

  cursorPosition.value = { row, col }
}

function clearCursorPosition() {
  cursorPosition.value = null
}

function handleBoardClick() {
  if (!cursorPosition.value || props.activeTool === 'inspect') {
    return
  }

  emit('placeHole', cursorPosition.value.row, cursorPosition.value.col)
}
</script>

<template>
  <div class="h-full rounded-[30px] border border-black/10 bg-white/70 p-3 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.5)] backdrop-blur sm:p-5">
    <div class="flex h-full flex-col rounded-[24px] bg-[radial-gradient(circle_at_top,#fff7ed,transparent_28%),linear-gradient(180deg,#fde68a_0%,#f3e2a6_100%)] p-3 sm:p-4">
      <div class="mb-3 flex min-h-8 items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-stone-600">
        <div class="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
          <button :class="toolClasses('inspect')" @click="emit('setTool', 'inspect')">Inspect</button>
          <button :class="toolClasses('cut')" @click="emit('setTool', 'cut')">Cut</button>
          <button :class="toolClasses('link')" @click="emit('setTool', 'link')">Link</button>
          <button :class="toolClasses('wire')" @click="emit('setTool', 'wire')">Wire</button>
        </div>

        <div class="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-2 overflow-hidden text-right">
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
            :class="activeTool === 'inspect' ? 'cursor-crosshair' : 'cursor-cell'"
            @click="handleBoardClick"
            @pointerleave="clearCursorPosition"
            @pointermove="updateCursorPosition"
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
            <g v-for="cut in board.cuts" :key="cut.id">
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
            <path
              v-for="link in board.links"
              :key="link.id"
              :d="`M ${pointX(link.fromCol)} ${pointY(link.fromRow)} Q ${(pointX(link.fromCol) + pointX(link.toCol)) / 2} ${Math.min(pointY(link.fromRow), pointY(link.toRow)) - 18} ${pointX(link.toCol)} ${pointY(link.toRow)}`"
              :stroke="link.color ?? '#0f766e'"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"
            />
          </g>

          <g>
            <g v-for="wire in board.wires" :key="wire.id">
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