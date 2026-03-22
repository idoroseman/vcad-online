<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  projectName: string
  online: boolean
  storageMode: 'local' | 'cloud'
}>()

defineEmits<{
  rename: []
  newBoard: []
  addLink: []
  addWire: []
}>()

const storageLabel = computed(() => (props.storageMode === 'cloud' ? 'Cloud project' : 'Offline working copy'))
</script>

<template>
  <header class="border-b border-black/10 bg-white/80 backdrop-blur">
    <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div class="flex items-center gap-3">
        <div class="rounded-2xl bg-stone-900 px-3 py-2 text-sm font-semibold tracking-[0.24em] text-stone-50 uppercase">
          vCad
        </div>
        <div>
          <div class="text-sm font-semibold text-stone-900">{{ projectName }}</div>
          <div class="text-xs text-stone-500">{{ storageLabel }}</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('rename')">
          Rename
        </button>
        <button class="rounded-full border border-stone-300 bg-white px-4 py-2 text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="$emit('newBoard')">
          New board
        </button>
        <button class="rounded-full bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-700" @click="$emit('addLink')">
          Add link
        </button>
        <button class="rounded-full bg-amber-500 px-4 py-2 font-medium text-stone-950 transition hover:bg-amber-400" @click="$emit('addWire')">
          Add wire
        </button>
        <RouterLink
          v-if="online"
          class="rounded-full border border-stone-300 bg-white px-4 py-2 text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          to="/projects"
        >
          Projects
        </RouterLink>
      </div>
    </div>
  </header>
</template>