<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import BoardCanvas from '../components/editor/BoardCanvas.vue'
import { loadSharedProjectByToken } from '../firebase/projects'
import type { BoardState } from '../lib/types'

type SelectedItem = { kind: 'cut' | 'component' | 'link' | 'wire'; id: string } | null

const route = useRoute()

const loading = ref(true)
const errorMessage = ref<string | null>(null)
const board = ref<BoardState | null>(null)
const selectedItem = ref<SelectedItem>(null)

const activeTool = ref<'inspect'>('inspect')
const activeFootprintId = ref('resistor-axial-7')
const activeWireType = ref<'input'>('input')
const pendingLinkStart = ref<{ row: number; col: number } | null>(null)

async function loadShared() {
  const token = typeof route.params.token === 'string' ? route.params.token : ''

  if (!token) {
    errorMessage.value = 'Missing share token.'
    loading.value = false
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    const cloudProject = await loadSharedProjectByToken(token)
    board.value = {
      ...cloudProject.board,
      projectName: cloudProject.name,
      storageMode: 'cloud',
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load shared project.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadShared()
})
</script>

<template>
  <div class="min-h-screen bg-transparent px-4 py-4 text-stone-900 sm:px-6">
    <div class="mx-auto max-w-7xl">
      <header class="mb-4 rounded-3xl border border-black/10 bg-white/80 px-5 py-4 backdrop-blur">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Shared Project</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
          {{ board?.projectName || 'Read-only share' }}
        </h1>
        <p class="mt-2 text-sm text-stone-600">This link is view-only. Open your own project workspace to edit.</p>
      </header>

      <p v-if="loading" class="rounded-2xl border border-stone-200 bg-white/75 px-4 py-3 text-sm text-stone-700">
        Loading shared project...
      </p>

      <p v-else-if="errorMessage" class="rounded-2xl border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-900">
        {{ errorMessage }}
      </p>

      <div v-else-if="board" class="rounded-3xl border border-black/10 bg-white/70 p-3 backdrop-blur">
        <BoardCanvas
          :active-tool="activeTool"
          :active-footprint-id="activeFootprintId"
          :active-wire-type="activeWireType"
          :board="board"
          :pending-link-start="pendingLinkStart"
          :show-ratsnest="true"
          :selected-item="selectedItem"
          @inspect-hole="() => null"
          @move-selected-component="() => null"
          @place-hole="() => null"
          @move-selected-cut="() => null"
          @move-selected-link="() => null"
          @move-selected-wire="() => null"
          @set-footprint="() => null"
          @crop-board="() => null"
          @select-item="(item) => (selectedItem = item)"
          @set-tool="() => null"
          @toggle-ratsnest="() => null"
        />
      </div>
    </div>
  </div>
</template>
