<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ActiveTool, BoardState, WireType } from '../../lib/types'

const props = defineProps<{
  board: BoardState
  activeTool: ActiveTool
  activeWireType: WireType
  pendingLinkStart: { row: number; col: number } | null
  selectedItem: { kind: 'cut' | 'link' | 'wire'; id: string } | null
  counts: {
    cuts: number
    links: number
    wires: number
    components: number
  }
}>()

defineEmits<{
  setWireType: [type: WireType]
  deleteSelected: []
  updateSelectedLinkColor: [color: string]
  updateSelectedWireSignalName: [signalName: string]
  updateSelectedWireType: [type: WireType]
  updateSelectedWireNote: [note: string]
}>()

const wireTypes: WireType[] = ['input', 'output', 'bidirectional', 'power', 'gnd']
const activeTab = ref<'project' | 'properties'>('project')

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
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Project</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900">{{ board.projectName }}</h1>
        <p class="mt-2 text-sm leading-6 text-stone-600">
          Immediate editor-first workflow. Guests keep one working project locally, and signed-in users can open cloud projects from the Projects screen.
        </p>
      </section>

      <section class="grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-2xl bg-stone-900 px-3 py-4 text-stone-50">
          <div class="text-xs uppercase tracking-[0.18em] text-stone-300">Board</div>
          <div class="mt-2 text-lg font-semibold">{{ board.rows }} × {{ board.cols }}</div>
        </div>
        <div class="rounded-2xl bg-orange-100 px-3 py-4 text-orange-950">
          <div class="text-xs uppercase tracking-[0.18em] text-orange-700">Storage</div>
          <div class="mt-2 text-lg font-semibold">{{ board.storageMode }}</div>
        </div>
      </section>

      <section v-if="activeTool === 'wire'">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Wire Type</p>
        <div class="mt-3 flex flex-wrap gap-2 text-sm">
          <button
            v-for="type in wireTypes"
            :key="type"
            class="rounded-full px-3 py-2 capitalize"
            :class="activeWireType === type ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700'"
            @click="$emit('setWireType', type)"
          >
            {{ type }}
          </button>
        </div>
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

      <section class="rounded-[24px] bg-linear-to-br from-sky-50 to-cyan-100 p-4 text-sm text-sky-950">
        <p class="font-semibold">Next implementation targets</p>
        <ul class="mt-3 space-y-2 text-sky-900/80">
          <li>KiCad schematic import</li>
          <li>Cut tool and strip segmentation</li>
          <li>Ratsnest and print layout</li>
        </ul>
      </section>
    </template>

    <template v-else>
      <section>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Selection</p>
        <div class="mt-3 rounded-2xl bg-stone-100 px-3 py-3 text-sm text-stone-700">
          <p v-if="selectedItem" class="font-medium">
            Selected: <span class="capitalize">{{ selectedItem.kind }}</span>
          </p>
          <p v-else>No item selected</p>
        </div>
      </section>

      <section v-if="selectedCut" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Cut Properties</p>
        <p class="mt-2">Row {{ selectedCut.row }}, Col {{ selectedCut.col }}</p>
      </section>

      <section v-if="selectedLink" class="rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Link Properties</p>
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