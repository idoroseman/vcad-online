<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { getBodyRadius, getDipPinCount, getDipWidth, getFootprint, getLeadPitch, getPinLayout } from '../../lib/footprints'
import type { ActiveTool, BoardState, PinLayout, PlacedComponent, WireType } from '../../lib/types'

const props = defineProps<{
  board: BoardState
  activeTool: ActiveTool
  activeFootprintId: string
  activeWireType: WireType
  pendingLinkStart: { row: number; col: number } | null
  selectedItem: { kind: 'cut' | 'component' | 'link' | 'wire'; id: string } | null
  counts: {
    cuts: number
    links: number
    wires: number
    components: number
  }
}>()

defineEmits<{
  setFootprint: [footprintId: string]
  setWireType: [type: WireType]
  deleteSelected: []
  resizeBoard: [rows: number, cols: number]
  moveSelectedComponent: [row: number, col: number]
  updateSelectedLinkColor: [color: string]
  moveSelectedCut: [row: number, col: number]
  moveSelectedLink: [fromRow: number, fromCol: number, toRow: number, toCol: number]
  moveSelectedWire: [row: number, col: number]
  updateSelectedComponentBodyRadius: [bodyRadius: number]
  updateSelectedComponentDipPins: [dipPins: number]
  updateSelectedComponentDipWidth: [dipWidth: number]
  updateSelectedComponentPinLayout: [pinLayout: PinLayout]
  updateSelectedComponentPolarityMarked: [polarityMarked: boolean]
  updateSelectedComponentTwoLeadStyle: [style: 'axial' | 'radial' | 'single-row']
  updateSelectedComponentLeadPitch: [leadPitch: number]
  updateSelectedComponentRefDes: [refDes: string]
  updateSelectedComponentRotation: [rotation: PlacedComponent['rotation']]
  updateSelectedComponentValue: [value: string]
  updateSelectedWireSignalName: [signalName: string]
  updateSelectedWireType: [type: WireType]
  updateSelectedWireNote: [note: string]
}>()

const wireTypes: WireType[] = ['input', 'output', 'bidirectional', 'power', 'gnd']
const rotationOptions: PlacedComponent['rotation'][] = [0, 1, 2, 3]
const activeTab = ref<'project' | 'properties'>('project')

const selectedComponent = computed(() => {
  if (!props.selectedItem || props.selectedItem.kind !== 'component') {
    return null
  }

  return props.board.components.find((item) => item.id === props.selectedItem?.id) ?? null
})

const selectedCut = computed(() => {
  if (!props.selectedItem || props.selectedItem.kind !== 'cut') {
    return null
  }

  return props.board.cuts.find((item) => item.id === props.selectedItem?.id) ?? null
})

const selectedLink = computed(() => {
  if (!props.selectedItem || props.selectedItem.kind !== 'link') {
    return null
  }

  return props.board.links.find((item) => item.id === props.selectedItem?.id) ?? null
})

const selectedWire = computed(() => {
  if (!props.selectedItem || props.selectedItem.kind !== 'wire') {
    return null
  }

  return props.board.wires.find((item) => item.id === props.selectedItem?.id) ?? null
})

watch(
  () => props.selectedItem,
  (selectedItem) => {
    if (selectedItem) {
      activeTab.value = 'properties'
    }
  },
)

function toCoordinate(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toBoardSize(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toRotation(value: string, fallback: PlacedComponent['rotation']) {
  const parsed = Number.parseInt(value, 10)

  if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed
  }

  return fallback
}

function nextRotation(rotation: PlacedComponent['rotation']): PlacedComponent['rotation'] {
  return ((rotation + 1) % 4) as PlacedComponent['rotation']
}

function toLeadPitch(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toDipPins(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toDipWidth(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toTwoLeadStyle(value: string, fallback: 'axial' | 'radial' | 'single-row') {
  if (value === 'axial' || value === 'radial' || value === 'single-row') {
    return value
  }

  return fallback
}

function supportsTwoLeadStyle(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'dip') {
    return true
  }

  return getPinLayout(component) === 'single-row' && (getDipPinCount(component) ?? 0) <= 2
}

function getTwoLeadStyle(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style === 'dip') {
    return 'single-row' as const
  }

  return footprint.style
}

function supportsPolarityMark(component: PlacedComponent) {
  const style = getTwoLeadStyle(component)
  return style === 'axial' || style === 'radial'
}

function toBodyDiameter(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return parsed
}

function toPinLayout(value: string, fallback: PinLayout) {
  if (value === 'single-row' || value === 'dual-row') {
    return value
  }

  return fallback
}
</script>

<template>
  <aside class="flex h-full flex-col gap-4 rounded-[28px] border border-black/10 bg-white/75 p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
    <div class="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1 text-sm">
      <button
        class="rounded-xl px-3 py-2 font-medium"
        :class="activeTab === 'project' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'"
        @click="activeTab = 'project'"
      >
        Project
      </button>
      <button
        class="rounded-xl px-3 py-2 font-medium"
        :class="activeTab === 'properties' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'"
        @click="activeTab = 'properties'"
      >
        Properties
      </button>
    </div>

    <template v-if="activeTab === 'project'">
      <section>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Board Size</p>
        <div class="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Rows</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="5"
              :max="200"
              :value="board.rows"
              @change="$emit('resizeBoard', toBoardSize(($event.target as HTMLInputElement).value, board.rows), board.cols)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Columns</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="8"
              :max="200"
              :value="board.cols"
              @change="$emit('resizeBoard', board.rows, toBoardSize(($event.target as HTMLInputElement).value, board.cols))"
            />
          </label>
        </div>
        <p class="mt-2 text-xs leading-5 text-stone-500">
          Shrinking the board removes cuts, links, wires, and placed items that fall outside the new bounds.
        </p>
      </section>

      <section>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Objects</p>
        <dl class="mt-3 space-y-2 text-sm text-stone-700">
          <div class="flex items-center justify-between rounded-2xl bg-stone-100 px-3 py-2">
            <dt>Components</dt>
            <dd class="font-semibold">{{ counts.components }}</dd>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-stone-100 px-3 py-2">
            <dt>Links</dt>
            <dd class="font-semibold">{{ counts.links }}</dd>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-stone-100 px-3 py-2">
            <dt>Wires</dt>
            <dd class="font-semibold">{{ counts.wires }}</dd>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-stone-100 px-3 py-2">
            <dt>Cuts</dt>
            <dd class="font-semibold">{{ counts.cuts }}</dd>
          </div>
        </dl>
      </section>

      <section class="grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-2xl bg-orange-100 px-3 py-4 text-orange-950">
          <div class="text-xs uppercase tracking-[0.18em] text-orange-700">Storage</div>
          <div class="mt-2 text-lg font-semibold">{{ board.storageMode }}</div>
        </div>
      </section>

      <section v-if="false" class="rounded-[24px] bg-linear-to-br from-sky-50 to-cyan-100 p-4 text-sm text-sky-950">
        <p class="font-semibold">Next implementation targets</p>
        <ul class="mt-3 space-y-2 text-sky-900/80">
          <li>KiCad schematic import</li>
          <li>Component placement and footprint mapping</li>
          <li>Ratsnest and print layout</li>
        </ul>
      </section>
    </template>

    <template v-else>
      <section v-if="!selectedItem" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Nothing selected</p>
        <p class="mt-1 text-xs text-stone-500">Click a component, link, wire, or cut to edit its properties.</p>
      </section>

      <section v-if="selectedCut" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Cut Properties</p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Row</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.rows - 1"
              :value="selectedCut.row"
              @change="$emit('moveSelectedCut', toCoordinate(($event.target as HTMLInputElement).value, selectedCut.row), selectedCut.col)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Col</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.cols - 1"
              :value="selectedCut.col"
              @change="$emit('moveSelectedCut', selectedCut.row, toCoordinate(($event.target as HTMLInputElement).value, selectedCut.col))"
            />
          </label>
        </div>
      </section>

      <section v-if="selectedComponent" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">

        <div class="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Row</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.rows - 1"
              :value="selectedComponent.row"
              @change="$emit('moveSelectedComponent', toCoordinate(($event.target as HTMLInputElement).value, selectedComponent.row), selectedComponent.col)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Col</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.cols - 1"
              :value="selectedComponent.col"
              @change="$emit('moveSelectedComponent', selectedComponent.row, toCoordinate(($event.target as HTMLInputElement).value, selectedComponent.col))"
            />
          </label>
        </div>

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Reference</label>
        <input
          type="text"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="selectedComponent.refDes"
          @input="$emit('updateSelectedComponentRefDes', ($event.target as HTMLInputElement).value)"
        />

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Value</label>
        <input
          type="text"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="selectedComponent.value"
          @input="$emit('updateSelectedComponentValue', ($event.target as HTMLInputElement).value)"
        />

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Rotation</label>
        <div class="mt-2 flex items-center gap-2">
          <select
            class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            :value="selectedComponent.rotation"
            @change="$emit('updateSelectedComponentRotation', toRotation(($event.target as HTMLSelectElement).value, selectedComponent.rotation))"
          >
            <option v-for="rotation in rotationOptions" :key="`rotation-${rotation}`" :value="rotation">
              {{ rotation * 90 }}°
            </option>
          </select>
          <button
            type="button"
            class="shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            aria-label="Rotate component"
            title="Rotate component"
            @click="$emit('updateSelectedComponentRotation', nextRotation(selectedComponent.rotation))"
          >
            <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14.5 6.5V2.5h-4" />
              <path d="M14 14.5a6 6 0 1 1 .5-8" />
              <path d="M10.5 2.5l4 4" />
            </svg>
          </button>
        </div>

        <label
          v-if="supportsTwoLeadStyle(selectedComponent)"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Lead Style
        </label>
        <select
          v-if="supportsTwoLeadStyle(selectedComponent)"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="getTwoLeadStyle(selectedComponent)"
          @change="$emit('updateSelectedComponentTwoLeadStyle', toTwoLeadStyle(($event.target as HTMLSelectElement).value, getTwoLeadStyle(selectedComponent)))"
        >
          <option value="axial">Axial</option>
          <option value="radial">Radial</option>
          <option value="single-row">Single Row</option>
        </select>

        <label
          v-if="supportsPolarityMark(selectedComponent)"
          class="mt-3 flex items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
        >
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
            :checked="selectedComponent.polarityMarked ?? false"
            @change="$emit('updateSelectedComponentPolarityMarked', ($event.target as HTMLInputElement).checked)"
          />
          <span>Polarity Mark</span>
        </label>

        <label
          v-if="getFootprint(selectedComponent.footprintId).style !== 'dip'"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Pitch
        </label>
        <input
          v-if="getFootprint(selectedComponent.footprintId).style !== 'dip'"
          type="number"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :min="getFootprint(selectedComponent.footprintId).minLeadPitch ?? (getFootprint(selectedComponent.footprintId).style === 'radial' ? 1 : 3)"
          :max="getFootprint(selectedComponent.footprintId).maxLeadPitch ?? 24"
          :value="getLeadPitch(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultLeadPitch ?? (getFootprint(selectedComponent.footprintId).style === 'radial' ? 2 : 6)"
          @input="$emit('updateSelectedComponentLeadPitch', toLeadPitch(($event.target as HTMLInputElement).value, getLeadPitch(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultLeadPitch ?? (getFootprint(selectedComponent.footprintId).style === 'radial' ? 2 : 6)))"
        />

        <label
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip'"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Pin Layout
        </label>
        <select
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip'"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="getPinLayout(selectedComponent)"
          @change="$emit('updateSelectedComponentPinLayout', toPinLayout(($event.target as HTMLSelectElement).value, getPinLayout(selectedComponent)))"
        >
          <option value="single-row">Single Row</option>
          <option value="dual-row">Dual Row (IC)</option>
        </select>

        <label
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip'"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Pins
        </label>
        <input
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip'"
          type="number"
          :step="getPinLayout(selectedComponent) === 'single-row' ? 1 : 2"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :min="getPinLayout(selectedComponent) === 'single-row' ? 1 : (getFootprint(selectedComponent.footprintId).minDipPins ?? 4)"
          :max="getFootprint(selectedComponent.footprintId).maxDipPins ?? 40"
          :value="getDipPinCount(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultDipPins ?? 8"
          @input="$emit('updateSelectedComponentDipPins', toDipPins(($event.target as HTMLInputElement).value, getDipPinCount(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultDipPins ?? 8))"
        />

        <label
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip' && getPinLayout(selectedComponent) === 'dual-row'"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Chip Width
        </label>
        <input
          v-if="getFootprint(selectedComponent.footprintId).style === 'dip' && getPinLayout(selectedComponent) === 'dual-row'"
          type="number"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :min="getFootprint(selectedComponent.footprintId).minDipWidth ?? 2"
          :max="getFootprint(selectedComponent.footprintId).maxDipWidth ?? 12"
          :value="getDipWidth(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultDipWidth ?? 3"
          @input="$emit('updateSelectedComponentDipWidth', toDipWidth(($event.target as HTMLInputElement).value, getDipWidth(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultDipWidth ?? 3))"
        />

        <label
          v-if="getFootprint(selectedComponent.footprintId).style === 'radial'"
          class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Diameter (mm)
        </label>
        <input
          v-if="getFootprint(selectedComponent.footprintId).style === 'radial'"
          type="number"
          step="0.1"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :min="(getFootprint(selectedComponent.footprintId).minBodyRadius ?? 0.75) * 2"
          :max="(getFootprint(selectedComponent.footprintId).maxBodyRadius ?? 4) * 2"
          :value="(getBodyRadius(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultBodyRadius ?? 1.2) * 2"
          @input="$emit('updateSelectedComponentBodyRadius', toBodyDiameter(($event.target as HTMLInputElement).value, (getBodyRadius(selectedComponent) ?? getFootprint(selectedComponent.footprintId).defaultBodyRadius ?? 1.2) * 2) / 2)"
        />
      </section>

      <section v-if="selectedLink" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Link Properties</p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">From Row</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.rows - 1"
              :value="selectedLink.fromRow"
              @change="$emit('moveSelectedLink', toCoordinate(($event.target as HTMLInputElement).value, selectedLink.fromRow), selectedLink.fromCol, selectedLink.toRow, selectedLink.toCol)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">From Col</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.cols - 1"
              :value="selectedLink.fromCol"
              @change="$emit('moveSelectedLink', selectedLink.fromRow, toCoordinate(($event.target as HTMLInputElement).value, selectedLink.fromCol), selectedLink.toRow, selectedLink.toCol)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">To Row</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.rows - 1"
              :value="selectedLink.toRow"
              @change="$emit('moveSelectedLink', selectedLink.fromRow, selectedLink.fromCol, toCoordinate(($event.target as HTMLInputElement).value, selectedLink.toRow), selectedLink.toCol)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">To Col</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.cols - 1"
              :value="selectedLink.toCol"
              @change="$emit('moveSelectedLink', selectedLink.fromRow, selectedLink.fromCol, selectedLink.toRow, toCoordinate(($event.target as HTMLInputElement).value, selectedLink.toCol))"
            />
          </label>
        </div>
        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Color</label>
        <div class="mt-2 flex items-center gap-3">
          <input
            type="color"
            class="h-10 w-14 rounded border border-stone-300 bg-white"
            :value="selectedLink.color ?? '#0f766e'"
            @input="$emit('updateSelectedLinkColor', ($event.target as HTMLInputElement).value)"
          />
          <span class="text-xs text-stone-500">{{ selectedLink.color ?? '#0f766e' }}</span>
        </div>
      </section>

      <section v-if="selectedWire" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Wire Properties</p>

        <div class="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Row</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.rows - 1"
              :value="selectedWire.row"
              @change="$emit('moveSelectedWire', toCoordinate(($event.target as HTMLInputElement).value, selectedWire.row), selectedWire.col)"
            />
          </label>
          <label>
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Col</span>
            <input
              type="number"
              class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              :min="0"
              :max="board.cols - 1"
              :value="selectedWire.col"
              @change="$emit('moveSelectedWire', selectedWire.row, toCoordinate(($event.target as HTMLInputElement).value, selectedWire.col))"
            />
          </label>
        </div>

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Signal Name</label>
        <input
          type="text"
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="selectedWire.signalName"
          @input="$emit('updateSelectedWireSignalName', ($event.target as HTMLInputElement).value)"
        />

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Type</label>
        <select
          class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm capitalize"
          :value="selectedWire.type"
          @change="$emit('updateSelectedWireType', ($event.target as HTMLSelectElement).value as WireType)"
        >
          <option v-for="type in wireTypes" :key="`selected-${type}`" :value="type" class="capitalize">
            {{ type }}
          </option>
        </select>

        <label class="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Note</label>
        <textarea
          class="mt-2 min-h-20 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          :value="selectedWire.note ?? ''"
          @input="$emit('updateSelectedWireNote', ($event.target as HTMLTextAreaElement).value)"
        />
      </section>

      <section v-if="selectedItem">
        <button
          class="w-full rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
          @click="$emit('deleteSelected')"
        >
          Delete selected
        </button>
      </section>
    </template>
  </aside>
</template>