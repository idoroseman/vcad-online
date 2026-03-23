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

const { board, counts, online, showRatsnest, activeTool, activeFootprintId, activeWireType, pendingLinkStart, selectedItem } =
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

async function handleImportNetlist(file: File) {
  try {
    const source = await file.text()
    const netlist = boardStore.importKiCadNetlist(source)
    const isSchematic = file.name.toLowerCase().endsWith('.kicad_sch')

    if (isSchematic && netlist.nets.length === 0) {
      window.alert(
        `Imported ${netlist.components.length} components from ${file.name}.\n\n` +
          'Schematic net connectivity is not yet extracted from .kicad_sch directly. ' +
          'For full nets/ratsnest import, use a KiCad netlist export (.xml/.net).',
      )
      return
    }

    window.alert(`Imported ${netlist.nets.length} nets and ${netlist.components.length} components from ${file.name}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed.'
    window.alert(message)
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
      @import-netlist="handleImportNetlist"
      @rename="handleRename"
      @new-board="handleNewBoard"
    />

    <main class="grid min-h-[calc(100vh-115px)] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <InspectorPanel
        :active-tool="activeTool"
        :active-footprint-id="activeFootprintId"
        :active-wire-type="activeWireType"
        :board="board"
        :counts="counts"
        :pending-link-start="pendingLinkStart"
        :selected-item="selectedItem"
        @delete-selected="boardStore.deleteSelected"
        @move-selected-component="boardStore.moveSelectedComponent"
        @move-selected-cut="boardStore.moveSelectedCut"
        @move-selected-link="boardStore.moveSelectedLink"
        @move-selected-wire="boardStore.moveSelectedWire"
        @resize-board="boardStore.resizeBoard"
        @set-footprint="boardStore.setActiveFootprint"
        @update-selected-component-body-radius="boardStore.updateSelectedComponentBodyRadius"
        @update-selected-component-dip-pins="boardStore.updateSelectedComponentDipPins"
        @update-selected-component-dip-width="boardStore.updateSelectedComponentDipWidth"
        @update-selected-component-pin-layout="boardStore.updateSelectedComponentPinLayout"
        @update-selected-component-two-lead-style="boardStore.updateSelectedComponentTwoLeadStyle"
        @update-selected-component-lead-pitch="boardStore.updateSelectedComponentLeadPitch"
        @set-wire-type="boardStore.setActiveWireType"
        @update-selected-component-ref-des="boardStore.updateSelectedComponentRefDes"
        @update-selected-component-rotation="boardStore.updateSelectedComponentRotation"
        @update-selected-component-value="boardStore.updateSelectedComponentValue"
        @update-selected-link-color="boardStore.updateSelectedLinkColor"
        @update-selected-wire-note="boardStore.updateSelectedWireNote"
        @update-selected-wire-signal-name="boardStore.updateSelectedWireSignalName"
        @update-selected-wire-type="boardStore.updateSelectedWireType"
      />
      <BoardCanvas
        :active-tool="activeTool"
        :active-footprint-id="activeFootprintId"
        :active-wire-type="activeWireType"
        :board="board"
        :pending-link-start="pendingLinkStart"
        :show-ratsnest="showRatsnest"
        :selected-item="selectedItem"
        @inspect-hole="boardStore.inspectAtHole"
        @move-selected-component="boardStore.moveSelectedComponent"
        @place-hole="boardStore.placeAtHole"
        @move-selected-cut="boardStore.moveSelectedCut"
        @move-selected-link="boardStore.moveSelectedLink"
        @move-selected-wire="boardStore.moveSelectedWire"
        @set-footprint="boardStore.setActiveFootprint"
        @crop-board="boardStore.cropBoard"
        @select-item="boardStore.setSelectedItem"
        @set-tool="boardStore.setActiveTool"
        @toggle-ratsnest="boardStore.toggleRatsnest"
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