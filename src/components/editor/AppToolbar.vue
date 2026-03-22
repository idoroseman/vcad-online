<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import type { ActiveTool } from '../../lib/types'

const props = defineProps<{
  projectName: string
  online: boolean
  storageMode: 'local' | 'cloud'
  activeTool: ActiveTool
}>()

defineEmits<{
  rename: []
  newBoard: []
  setTool: [tool: ActiveTool]
}>()

const storageLabel = computed(() => (props.storageMode === 'cloud' ? 'Cloud project' : 'Offline working copy'))

function toolClasses(tool: ActiveTool) {
  return props.activeTool === tool
    ? 'rounded-full bg-stone-900 px-4 py-2 font-medium text-white'
    : 'rounded-full border border-stone-300 bg-white px-4 py-2 text-stone-700 transition hover:border-stone-400 hover:bg-stone-50'
}
</script>

<template>
  <header class="border-b border-black/10 bg-white/80 backdrop-blur">
    <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
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
        <RouterLink
          v-if="online"
          class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          to="/projects"
        >
          Projects
        </RouterLink>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button :class="toolClasses('inspect')" @click="$emit('setTool', 'inspect')">
          Inspect
        </button>
        <button :class="toolClasses('link')" @click="$emit('setTool', 'link')">
          Link tool
        </button>
        <button :class="toolClasses('wire')" @click="$emit('setTool', 'wire')">
          Wire tool
        </button>
      </div>
    </div>
  </header>
</template>