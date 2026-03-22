<script setup lang="ts">
import { computed, ref } from 'vue'

import type { BoardState } from '../../lib/types'

const props = defineProps<{
  board: BoardState
}>()

const pitch = 18
const boardWidth = computed(() => (props.board.cols - 1) * pitch + 64)
const boardHeight = computed(() => (props.board.rows - 1) * pitch + 64)

const rows = computed(() => Array.from({ length: props.board.rows }, (_, index) => index))
const cols = computed(() => Array.from({ length: props.board.cols }, (_, index) => index))
const holes = computed(() =>
  rows.value.flatMap((row) => cols.value.map((col) => ({ row, col, key: `${row}-${col}` }))),
)
const svgElement = ref<SVGSVGElement | null>(null)
const cursorPosition = ref<{ row: number; col: number } | null>(null)

function pointX(col: number) {
  return 32 + col * pitch
}

function pointY(row: number) {
  return 32 + row * pitch
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

function updateCursorPosition(event: PointerEvent) {
  if (!svgElement.value) {
    return
  }

  const bounds = svgElement.value.getBoundingClientRect()

  if (bounds.width === 0 || bounds.height === 0) {
    return
  }

  const x = ((event.clientX - bounds.left) / bounds.width) * boardWidth.value
  const y = ((event.clientY - bounds.top) / bounds.height) * boardHeight.value
  const row = Math.max(0, Math.min(props.board.rows - 1, Math.round((y - 32) / pitch)))
  const col = Math.max(0, Math.min(props.board.cols - 1, Math.round((x - 32) / pitch)))

  cursorPosition.value = { row, col }
}

function clearCursorPosition() {
  cursorPosition.value = null
}
</script>

<template>
  <div class="h-full rounded-[30px] border border-black/10 bg-white/70 p-3 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.5)] backdrop-blur sm:p-5">
    <div class="flex h-full flex-col rounded-[24px] bg-[radial-gradient(circle_at_top,#fff7ed,transparent_28%),linear-gradient(180deg,#fde68a_0%,#f3e2a6_100%)] p-3 sm:p-4">
      <div class="mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-stone-600">
        <span>Editor Canvas</span>
        <div class="flex flex-wrap items-center justify-end gap-2 text-right">
          <span>{{ board.rows }} rows · {{ board.cols }} columns</span>
          <span v-if="cursorPosition" class="rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-stone-50">
            R {{ cursorPosition.row }} · C {{ cursorPosition.col }}
          </span>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto rounded-[20px] border border-black/10 bg-[#f4ecce]">
        <svg
          ref="svgElement"
          :viewBox="`0 0 ${boardWidth} ${boardHeight}`"
          class="h-full min-h-[28rem] w-full cursor-crosshair"
          @pointerleave="clearCursorPosition"
          @pointermove="updateCursorPosition"
        >
          <rect x="0" y="0" :width="boardWidth" :height="boardHeight" fill="#efe0a8" />

          <g>
            <rect
              v-for="row in rows"
              :key="`strip-${row}`"
              x="18"
              :y="pointY(row) - 5"
              :width="boardWidth - 36"
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
</template>