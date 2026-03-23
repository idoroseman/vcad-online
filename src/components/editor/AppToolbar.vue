<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

type ExportFormat = 'svg' | 'png' | 'pdf'

const props = defineProps<{
  projectName: string
  online: boolean
  storageMode: 'local' | 'cloud'
}>()

const storageLabel = computed(() => (props.storageMode === 'cloud' ? 'Cloud project' : 'Offline working copy'))
const fileInput = ref<HTMLInputElement | null>(null)
const exportMenu = ref<HTMLDetailsElement | null>(null)

const emit = defineEmits<{
  rename: []
  newBoard: []
  importNetlist: [file: File]
  exportBoard: [format: ExportFormat]
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
          <div class="text-xs text-stone-500">{{ storageLabel }}</div>
        </div>

        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('rename')">
          Rename
        </button>
        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('newBoard')">
          New board
        </button>
        <button class="rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-800 transition hover:border-sky-400 hover:bg-sky-100" @click="openImportDialog">
          Import KiCad
        </button>
        <details ref="exportMenu" class="relative z-50">
          <summary class="list-none rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 cursor-pointer">
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
          v-if="online"
          class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          to="/projects"
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
    </div>
  </header>
</template>