<script setup lang="ts">
defineProps<{
  cloudSaveState?: 'idle' | 'saving' | 'saved' | 'queued' | 'error'
  cloudQueuedWrites?: number
  cloudSaveError?: string | null
}>()
</script>

<template>
  <footer class="border-t border-black/10 bg-stone-950 px-4 py-3 text-xs text-stone-300 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-4">
        <span></span>
      </div>
      <div class="flex flex-wrap items-center gap-4">
        <span v-if="cloudSaveState === 'queued'">Queued {{ cloudQueuedWrites ?? 0 }}</span>
        <span v-if="cloudSaveState === 'error'" class="text-rose-300">{{ cloudSaveError || 'Cloud save error' }}</span>
        
      </div>
    </div>
  </footer>
</template>