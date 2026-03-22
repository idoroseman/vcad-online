<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AppToolbar from '../components/editor/AppToolbar.vue'
import BoardCanvas from '../components/editor/BoardCanvas.vue'
import InspectorPanel from '../components/editor/InspectorPanel.vue'
import StatusBar from '../components/editor/StatusBar.vue'
import { useBoardStore } from '../stores/board'

const boardStore = useBoardStore()
const route = useRoute()

const { board, counts, online } = storeToRefs(boardStore)

if (typeof route.params.id === 'string' && route.params.id.length > 0) {
  boardStore.loadCloudProject(route.params.id)
}

function handleRename() {
  const name = window.prompt('Project name', board.value.projectName)

  if (name !== null) {
    boardStore.renameProject(name)
  }
}

function handleNewBoard() {
  const shouldReplace = window.confirm(
    'Start a new board? In guest mode this replaces the current offline working project.',
  )

  if (shouldReplace) {
    boardStore.resetBoard()
  }
}
</script>

<template>
  <div class="min-h-screen bg-transparent text-stone-900">
    <AppToolbar
      :online="online"
      :project-name="board.projectName"
      :storage-mode="board.storageMode"
      @rename="handleRename"
      @new-board="handleNewBoard"
      @add-link="boardStore.addLink()"
      @add-wire="boardStore.addWire()"
    />

    <main class="grid min-h-[calc(100vh-115px)] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <InspectorPanel :board="board" :counts="counts" />
      <BoardCanvas :board="board" />
    </main>

    <StatusBar
      :links="counts.links"
      :online="online"
      :project-name="board.projectName"
      :storage-mode="board.storageMode"
      :wires="counts.wires"
    />
  </div>
</template>