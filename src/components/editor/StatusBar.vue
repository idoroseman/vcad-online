<script setup lang="ts">
defineProps<{
  projectName: string
  online: boolean
  storageMode: 'local' | 'cloud'
  links: number
  wires: number
}>()
</script>

<template>
  <footer class="border-t border-black/10 bg-stone-950 px-4 py-3 text-xs text-stone-300 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-4">
        <span>{{ projectName }}</span>
        <span>{{ storageMode === 'cloud' ? 'Cloud save target' : 'Offline working copy' }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-4">
        <span>{{ online ? 'Online' : 'Offline' }}</span>
        <span>{{ links }} links</span>
        <span>{{ wires }} wires</span>
      </div>
    </div>
  </footer>
</template>