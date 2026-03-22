<script setup lang="ts">
import { RouterLink } from 'vue-router'

const cloudProjects = [
  { id: 'audio-preamp', name: 'Audio Preamp', updatedAt: '2h ago' },
  { id: 'midi-io', name: 'MIDI I/O Breakout', updatedAt: 'yesterday' },
  { id: 'bench-supply', name: 'Bench Supply Front End', updatedAt: 'last week' },
]
</script>

<template>
  <div class="min-h-screen px-4 py-8 sm:px-6">
    <div class="mx-auto max-w-5xl rounded-[32px] border border-black/10 bg-white/75 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Cloud Projects</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Continue saved work</h1>
        </div>
        <RouterLink class="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white" to="/">
          Back to editor
        </RouterLink>
      </div>

      <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="project in cloudProjects" :key="project.id" class="rounded-[28px] border border-stone-200 bg-stone-50 p-5">
          <p class="text-xs uppercase tracking-[0.24em] text-stone-500">Updated {{ project.updatedAt }}</p>
          <h2 class="mt-3 text-xl font-semibold text-stone-900">{{ project.name }}</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">
            Cloud-saved stripboard design. Open it directly in the editor and keep the guest workflow separate.
          </p>
          <RouterLink
            class="mt-5 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
            :to="`/editor/${project.id}`"
          >
            Open project
          </RouterLink>
        </article>
      </div>
    </div>
  </div>
</template>