<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

type ExportFormat = 'svg' | 'png' | 'pdf'

import AppToolbar from '../components/editor/AppToolbar.vue'
import BoardCanvas from '../components/editor/BoardCanvas.vue'
import InspectorPanel from '../components/editor/InspectorPanel.vue'
import StatusBar from '../components/editor/StatusBar.vue'
import { createCloudProject } from '../firebase/projects'
import { observeAuthState, signOutCurrentUser, waitForInitialAuthUser } from '../firebase/auth'
import { clearGuestSession } from '../lib/local-session'
import { useBoardStore } from '../stores/board'

const boardStore = useBoardStore()
const route = useRoute()
const router = useRouter()
const boardCanvas = ref<InstanceType<typeof BoardCanvas> | null>(null)
const isAuthenticated = ref(false)
const currentUserUid = ref<string | null>(null)
const isMigratingToCloud = ref(false)
let stopAuthObserver: (() => void) | null = null

const {
  board,
  counts,
  online,
  showRatsnest,
  activeTool,
  activeFootprintId,
  activeWireType,
  pendingLinkStart,
  selectedItem,
  cloudEnabled,
  cloudQueuedWrites,
  cloudSaveError,
  cloudSaveState,
} = storeToRefs(boardStore)

const isBoardEmpty = computed(() => {
  const b = board.value
  return (
    b.components.length === 0 &&
    b.cuts.length === 0 &&
    b.links.length === 0 &&
    b.wires.length === 0 &&
    !b.netlist
  )
})

watch(
  () => route.params.id,
  (projectId) => {
    if (typeof projectId === 'string' && projectId.length > 0) {
      void boardStore.loadCloudProject(projectId)
    }
  },
  { immediate: true },
)

watch(
  [currentUserUid, board, () => route.params.id],
  ([uid]) => {
    if (uid) {
      void migrateLocalBoardToCloud(uid)
    }
  },
  { deep: true, immediate: true },
)

/** Returns true once the board has actual placed content. */
function isBoardPopulated() {
  const b = board.value
  return (
    b.components.length > 0 ||
    b.cuts.length > 0 ||
    b.links.length > 0 ||
    b.wires.length > 0
  )
}

async function migrateLocalBoardToCloud(ownerUid: string) {
  if (isMigratingToCloud.value) {
    return
  }

  if (board.value.storageMode !== 'local' || !isBoardPopulated()) {
    return
  }

  if (typeof route.params.id === 'string' && route.params.id.length > 0) {
    return
  }

  isMigratingToCloud.value = true

  try {
    const snapshot = JSON.parse(JSON.stringify(board.value)) as typeof board.value
    snapshot.storageMode = 'cloud'
    const cloudProjectId = await createCloudProject({
      ownerUid,
      name: snapshot.projectName,
      board: snapshot,
    })
    // Prevent this local board from being re-migrated after a page refresh.
    clearGuestSession()
    await router.replace(`/editor/${cloudProjectId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to migrate local board to cloud project.'
    window.alert(message)
  } finally {
    isMigratingToCloud.value = false
  }
}

function handleRename() {
  const name = window.prompt('Project name', board.value.projectName)

  if (name !== null) {
    boardStore.renameProject(name)
  }
}

async function handleNewBoard() {
  const shouldReplace = window.confirm(
    'Start a new board? In guest mode this replaces the current offline working project.',
  )

  if (!shouldReplace) {
    return
  }

  boardStore.resetBoard()
  clearGuestSession()
  await router.replace('/')
}

function sanitizeFilenamePart(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'vcad-board'
}

async function handleExportBoard(format: ExportFormat) {
  const filename = sanitizeFilenamePart(board.value.projectName)
  const exported = await boardCanvas.value?.exportBoard(format, filename)

  if (!exported) {
    window.alert('Export failed.')
  }
}

async function handleImportNetlist(file: File) {
  try {
    const source = await file.text()
    const netlist = boardStore.importKiCadNetlist(source)
    const isSchematic = file.name.toLowerCase().endsWith('.kicad_sch')

    // Ensure board updates render before showing blocking alerts.
    await nextTick()

    if (isSchematic && netlist.nets.length === 0) {
      requestAnimationFrame(() => {
        window.alert(
          `Imported ${netlist.components.length} components from ${file.name}.\n\n` +
            'Schematic net connectivity is not yet extracted from .kicad_sch directly. ' +
            'For full nets/ratsnest import, use a KiCad netlist export (.xml/.net).',
        )
      })
      return
    }

    requestAnimationFrame(() => {
      window.alert(`Imported ${netlist.nets.length} nets and ${netlist.components.length} components from ${file.name}.`)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed.'
    window.alert(message)
  }
}

async function handleAccountAction() {
  if (!isAuthenticated.value) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }

  const shouldSignOut = window.confirm('Signed in account detected. Sign out now?')

  if (!shouldSignOut) {
    return
  }

  try {
    await signOutCurrentUser()
    await router.push('/')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sign out.'
    window.alert(message)
  }
}

function handleAbout() {
  window.alert(
    'vCad Online\n\n' +
      'A web based stripboard editor by Ido Roseman.\n\n' +
      'Current features:\n' +
      '- Local offline working board\n' +
      '- Cloud backed projects\n' +
      '- KiCad netlist and schematic import\n' +
      '- SVG, PNG, and PDF export\n' ,
  )
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
  void waitForInitialAuthUser().then((user) => {
    if (!user) {
      return
    }

    isAuthenticated.value = true
    currentUserUid.value = user.uid
    boardStore.setCloudOwner(user.uid)
    void migrateLocalBoardToCloud(user.uid)
  })

  stopAuthObserver = observeAuthState((user) => {
    isAuthenticated.value = Boolean(user)
    currentUserUid.value = user?.uid ?? null
    boardStore.setCloudOwner(user?.uid ?? null)

    if (user) {
      void migrateLocalBoardToCloud(user.uid)
    }
  })
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  stopAuthObserver?.()
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="min-h-screen bg-transparent text-stone-900">
    <AppToolbar
      :online="online"
      :project-name="board.projectName"
      :storage-mode="board.storageMode"
      :is-board-empty="isBoardEmpty"
      :is-authenticated="isAuthenticated"
      :cloud-enabled="cloudEnabled"
      :cloud-queued-writes="cloudQueuedWrites"
      :cloud-save-state="cloudSaveState"
      @export-board="handleExportBoard"
      @import-netlist="handleImportNetlist"
      @about="handleAbout"
      @rename="handleRename"
      @new-board="handleNewBoard"
      @account-action="handleAccountAction"
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
        @update-selected-component-single-row-pitch="boardStore.updateSelectedComponentSingleRowPitch"
        @update-selected-component-dip-width="boardStore.updateSelectedComponentDipWidth"
        @update-selected-component-pin-layout="boardStore.updateSelectedComponentPinLayout"
        @update-selected-component-polarity-marked="boardStore.updateSelectedComponentPolarityMarked"
        @update-selected-component-two-lead-style="boardStore.updateSelectedComponentTwoLeadStyle"
        @update-selected-component-lead-pitch="boardStore.updateSelectedComponentLeadPitch"
        @set-wire-type="boardStore.setActiveWireType"
        @update-selected-component-ref-des="boardStore.updateSelectedComponentRefDes"
        @update-selected-component-rotation="boardStore.updateSelectedComponentRotation"
        @update-selected-component-value="boardStore.updateSelectedComponentValue"
        @update-selected-link-color="boardStore.updateSelectedLinkColor"
        @update-selected-wire-note="boardStore.updateSelectedWireNote"
        @update-selected-wire-color="boardStore.updateSelectedWireColor"
        @update-selected-wire-signal-name="boardStore.updateSelectedWireSignalName"
        @update-selected-wire-type="boardStore.updateSelectedWireType"
      />
      <BoardCanvas
        ref="boardCanvas"
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
      :cloud-queued-writes="cloudQueuedWrites"
      :cloud-save-error="cloudSaveError"
      :cloud-save-state="cloudSaveState"
    />
  </div>
</template>