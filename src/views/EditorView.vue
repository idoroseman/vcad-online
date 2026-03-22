<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AppToolbar from '../components/editor/AppToolbar.vue'
import BoardCanvas from '../components/editor/BoardCanvas.vue'
import InspectorPanel from '../components/editor/InspectorPanel.vue'
import StatusBar from '../components/editor/StatusBar.vue'
import { useBoardStore } from '../stores/board'

const boardStore = useBoardStore()
const route = useRoute()

const { board, counts, online, activeTool, activeWireType, pendingLinkStart, selectedItem } =
  storeToRefs(boardStore)

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

function handleKeyDown(event: KeyboardEvent) {
  if (activeTool.value !== 'inspect') {
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  if (!selectedItem.value) {
    return
  }

  event.preventDefault()
  boardStore.deleteSelected()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="min-h-screen bg-transparent text-stone-900">
    <AppToolbar
      :online="online"
      :project-name="board.projectName"
      :storage-mode="board.storageMode"
      @rename="handleRename"
      @new-board="handleNewBoard"
    />

    <main class="grid min-h-[calc(100vh-115px)] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <InspectorPanel
        :active-tool="activeTool"
        :active-wire-type="activeWireType"
        :board="board"
        :counts="counts"
        :pending-link-start="pendingLinkStart"
        :selected-item="selectedItem"
        @delete-selected="boardStore.deleteSelected"
        @move-selected-cut="boardStore.moveSelectedCut"
        @move-selected-link="boardStore.moveSelectedLink"
        @move-selected-wire="boardStore.moveSelectedWire"
        @resize-board="boardStore.resizeBoard"
        @set-wire-type="boardStore.setActiveWireType"
        @update-selected-link-color="boardStore.updateSelectedLinkColor"
        @update-selected-wire-note="boardStore.updateSelectedWireNote"
        @update-selected-wire-signal-name="boardStore.updateSelectedWireSignalName"
        @update-selected-wire-type="boardStore.updateSelectedWireType"
      />
      <BoardCanvas
        :active-tool="activeTool"
        :active-wire-type="activeWireType"
        :board="board"
        :pending-link-start="pendingLinkStart"
        :selected-item="selectedItem"
        @inspect-hole="boardStore.inspectAtHole"
        @place-hole="boardStore.placeAtHole"
        @move-selected-cut="boardStore.moveSelectedCut"
        @move-selected-link="boardStore.moveSelectedLink"
        @move-selected-wire="boardStore.moveSelectedWire"
        @select-item="boardStore.setSelectedItem"
        @set-tool="boardStore.setActiveTool"
      />
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