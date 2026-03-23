<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

type ExportFormat = 'svg' | 'png' | 'pdf'

const props = defineProps<{
  projectName: string
  online: boolean
  storageMode: 'local' | 'cloud'
  isBoardEmpty?: boolean
  isAuthenticated?: boolean
  cloudSaveState?: 'idle' | 'saving' | 'saved' | 'queued' | 'error'
  cloudQueuedWrites?: number
  cloudEnabled?: boolean
}>()

const storageLabel = computed(() => {
  if (props.storageMode === 'cloud') {
    return 'Cloud storage'
  }

  // If authenticated and online, show as "Cloud storage" (will auto-migrate when populated)
  if (props.isAuthenticated && props.online) {
    return 'Cloud storage'
  }

  return 'Offline working copy'
})
const cloudStatusLabel = computed(() => {
  const showBadge = props.storageMode === 'cloud' || (props.isAuthenticated && props.online)

  if (!showBadge) {
    return ''
  }

  if (props.isBoardEmpty) {
    return 'Empty'
  }

  if (props.storageMode !== 'cloud') {
    // Local mode but authenticated and online: no error states yet
    return 'Ready'
  }

  if (props.cloudEnabled === false) {
    return 'Cloud disabled'
  }

  if (props.cloudSaveState === 'saving') {
    return 'Saving...'
  }

  if (props.cloudSaveState === 'queued') {
    return props.cloudQueuedWrites && props.cloudQueuedWrites > 0 ? `Queued ${props.cloudQueuedWrites}` : 'Queued'
  }

  if (props.cloudSaveState === 'error') {
    return 'Save error'
  }

  if (props.cloudSaveState === 'saved') {
    return 'Saved'
  }

  return 'Ready'
})
const fileInput = ref<HTMLInputElement | null>(null)
const exportMenu = ref<HTMLDetailsElement | null>(null)

const emit = defineEmits<{
  rename: []
  newBoard: []
  importNetlist: [file: File]
  exportBoard: [format: ExportFormat]
  accountAction: []
}>()

function openImportDialog() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  emit('importNetlist', file)
  input.value = ''
}

function selectExport(format: ExportFormat) {
  emit('exportBoard', format)

  if (exportMenu.value) {
    exportMenu.value.open = false
  }
}
</script>

<template>
  <header class="relative z-40 border-b border-black/10 bg-white/80 backdrop-blur">
    <div class="relative z-40 flex flex-wrap items-center gap-4 px-4 py-3 overflow-visible sm:px-6">
      <div class="flex flex-wrap items-center gap-2 overflow-visible sm:gap-3">
        <div class="rounded-2xl bg-stone-900 px-3 py-2 text-sm font-semibold tracking-[0.24em] text-stone-50 uppercase shrink-0">
          vCad
        </div>
        <div class="mr-1">
          <div class="text-sm font-semibold text-stone-900">{{ projectName }}</div>
          <div class="text-xs text-stone-500">
            {{ storageLabel }}
            <span v-if="storageMode === 'cloud' || (isAuthenticated && online)" class="ml-2 rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700">
              {{ cloudStatusLabel }}
            </span>
          </div>
        </div>

        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('rename')">
          Rename
        </button>
        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('newBoard')">
          New board
        </button>
        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="openImportDialog">
          Import KiCad
        </button>
        <details ref="exportMenu" class="relative z-50">
          <summary class="list-none rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 cursor-pointer">
            <span class="inline-flex items-center gap-2">
              <span>Export</span>
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </summary>
          <div class="absolute left-0 top-[calc(100%+0.5rem)] z-[60] min-w-36 rounded-2xl border border-stone-200 bg-white p-2 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.4)]">
            <button class="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100" @click="selectExport('svg')">
              SVG
            </button>
            <button class="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100" @click="selectExport('png')">
              PNG
            </button>
            <button class="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100" @click="selectExport('pdf')">
              PDF
            </button>
          </div>
        </details>
        <RouterLink
          :to="online ? '/projects' : ''"
          :aria-disabled="!online"
          :tabindex="online ? 0 : -1"
          class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition"
          :class="online ? 'text-stone-700 hover:border-stone-400 hover:bg-stone-50' : 'cursor-not-allowed text-stone-400 opacity-60'"
          @click="!online && $event.preventDefault()"
        >
          Projects
        </RouterLink>
        <input
          ref="fileInput"
          type="file"
          accept=".xml,.net,.kicad_sch"
          class="hidden"
          @change="handleFileChange"
        />
      </div>

      <div class="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          v-if="isAuthenticated"
          class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50"
          @click="$emit('accountAction')"
        >
          Account
        </button>
        <template v-else>
          <button
            class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            @click="$emit('accountAction')"
          >
            Log In
          </button>
          <button
            class="rounded-full border border-amber-500 bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-900 shadow-[0_8px_20px_-12px_rgba(180,83,9,0.65)] transition hover:border-amber-600 hover:bg-amber-300"
            @click="$emit('accountAction')"
          >
            Sign Up
          </button>
        </template>
      </div>
    </div>
  </header>
</template>