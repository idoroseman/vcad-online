<script setup lang="ts">
import type { ActiveTool, BoardState, WireType } from '../../lib/types'

defineProps<{
  board: BoardState
  activeTool: ActiveTool
  activeWireType: WireType
  pendingLinkStart: { row: number; col: number } | null
  counts: {
    cuts: number
    links: number
    wires: number
    components: number
  }
}>()

defineEmits<{
  setTool: [tool: ActiveTool]
  setWireType: [type: WireType]
  cancelPlacement: []
}>()

const wireTypes: WireType[] = ['input', 'output', 'bidirectional', 'power', 'gnd']
</script>

<template>
  <aside class="flex h-full flex-col gap-4 rounded-[28px] border border-black/10 bg-white/75 p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
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

    <section>
      <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Tools</p>
      <div class="mt-3 flex flex-wrap gap-2 text-sm">
        <button class="rounded-full px-3 py-2" :class="activeTool === 'inspect' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'" @click="$emit('setTool', 'inspect')">
          Inspect
        </button>
        <button class="rounded-full px-3 py-2" :class="activeTool === 'link' ? 'bg-sky-600 text-white' : 'bg-stone-100 text-stone-700'" @click="$emit('setTool', 'link')">
          Link
        </button>
        <button class="rounded-full px-3 py-2" :class="activeTool === 'wire' ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700'" @click="$emit('setTool', 'wire')">
          Wire
        </button>
      </div>

      <div class="mt-4 rounded-[24px] bg-stone-100 p-4 text-sm text-stone-700">
        <p class="font-semibold text-stone-900">Current tool</p>
        <p class="mt-2 capitalize">{{ activeTool }}</p>
        <p v-if="activeTool === 'link' && pendingLinkStart" class="mt-2 text-xs text-stone-500">
          Start selected at row {{ pendingLinkStart.row }}, col {{ pendingLinkStart.col }}. Click a second hole to finish the link.
        </p>
        <p v-else-if="activeTool === 'link'" class="mt-2 text-xs text-stone-500">
          Click the first hole, then click the destination hole.
        </p>
        <p v-else-if="activeTool === 'wire'" class="mt-2 text-xs text-stone-500">
          Click any hole to place an external wire terminal.
        </p>
        <button
          v-if="activeTool !== 'inspect'"
          class="mt-3 rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700"
          @click="$emit('cancelPlacement')"
        >
          Cancel placement
        </button>
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
  </aside>
</template>