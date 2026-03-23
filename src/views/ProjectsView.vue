<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { getCurrentUser, waitForInitialAuthUser } from '../firebase/auth'
import {
  createCloudProject,
  deleteCloudProject,
  disableCloudProjectShare,
  enableCloudProjectShare,
  listCloudProjectsByOwner,
  renameCloudProject,
} from '../firebase/projects'
import type { BoardState } from '../lib/types'

const cloudProjects = ref<Array<{ id: string; name: string; updatedAtLabel: string; shareEnabled: boolean; isEmpty: boolean }>>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const sharingProjectId = ref<string | null>(null)

function createStarterBoard(name: string): BoardState {
  return {
    rows: 25,
    cols: 64,
    components: [],
    cuts: [],
    links: [],
    wires: [],
    netlist: null,
    storageMode: 'cloud',
    projectName: name,
  }
}

async function loadProjects() {
  loading.value = true
  errorMessage.value = null

  try {
    const user = getCurrentUser() ?? (await waitForInitialAuthUser())

    if (!user) {
      cloudProjects.value = []
      return
    }

    cloudProjects.value = await listCloudProjectsByOwner(user.uid)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load cloud projects.'
  } finally {
    loading.value = false
  }
}

async function handleCreateProject() {
  const user = getCurrentUser() ?? (await waitForInitialAuthUser())

  if (!user) {
    errorMessage.value = 'Sign in first to create a cloud project.'
    return
  }

  const proposedName = window.prompt('New project name', 'Untitled Cloud Project')

  if (!proposedName) {
    return
  }

  const name = proposedName.trim() || 'Untitled Cloud Project'

  try {
    await createCloudProject({
      ownerUid: user.uid,
      name,
      board: createStarterBoard(name),
    })
    await loadProjects()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create project.'
  }
}

async function handleRenameProject(projectId: string, currentName: string) {
  const proposedName = window.prompt('Rename project', currentName)

  if (!proposedName) {
    return
  }

  const nextName = proposedName.trim()

  if (!nextName) {
    return
  }

  try {
    await renameCloudProject(projectId, nextName)
    await loadProjects()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to rename project.'
  }
}

async function handleDeleteProject(projectId: string, name: string) {
  const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`)

  if (!confirmed) {
    return
  }

  try {
    await deleteCloudProject(projectId)
    await loadProjects()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to delete project.'
  }
}

async function handleToggleShareProject(projectId: string, isEnabled: boolean) {
  sharingProjectId.value = projectId
  errorMessage.value = null

  try {
    if (isEnabled) {
      await disableCloudProjectShare(projectId)
      await loadProjects()
      return
    }

    const token = await enableCloudProjectShare(projectId)
    const link = `${window.location.origin}/share/${token}`

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link)
      window.alert(`Share link copied:\n${link}`)
    } else {
      window.alert(`Share link:\n${link}`)
    }

    await loadProjects()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to update sharing settings.'
  } finally {
    sharingProjectId.value = null
  }
}

onMounted(async () => {
  await loadProjects()
})
</script>

<template>
  <div class="min-h-screen px-4 py-8 sm:px-6">
    <div class="mx-auto max-w-5xl rounded-[32px] border border-black/10 bg-white/75 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Cloud Projects</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Continue saved work</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button v-if="false" class="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" @click="handleCreateProject">
            New cloud project
          </button>
          <RouterLink
            class="rounded-full border border-amber-500 bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-900 shadow-[0_8px_20px_-12px_rgba(180,83,9,0.65)] transition hover:border-amber-600 hover:bg-amber-300"
            to="/"
          >
            Go to editor
          </RouterLink>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-4 rounded-2xl border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-900">
        {{ errorMessage }}
      </p>

      <p v-if="loading" class="mt-8 text-sm text-stone-600">Loading cloud projects...</p>

      <p v-else-if="cloudProjects.length === 0" class="mt-8 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
        No cloud projects yet. Create one to start syncing online.
      </p>

      <div v-else class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="project in cloudProjects" :key="project.id" class="rounded-[28px] border border-stone-200 bg-stone-50 p-5">
          <p class="text-xs uppercase tracking-[0.24em] text-stone-500">Updated {{ project.updatedAtLabel }}</p>
          <h2 class="mt-3 text-xl font-semibold text-stone-900">{{ project.name }}</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">
            {{ project.isEmpty ? 'Cloud project (empty)' : 'Cloud-saved stripboard design. Open it directly in the editor and keep the guest workflow separate.' }}
          </p>
          <p class="mt-2 text-xs font-medium" :class="project.shareEnabled ? 'text-emerald-700' : 'text-stone-500'">
            {{ project.shareEnabled ? 'Sharing enabled' : 'Not shared' }}
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-2">
            <RouterLink
              class="inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
              :to="`/editor/${project.id}`"
            >
              Open project
            </RouterLink>
            <button
              class="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              :disabled="sharingProjectId === project.id"
              @click="handleToggleShareProject(project.id, project.shareEnabled)"
            >
              {{ project.shareEnabled ? 'Disable share' : 'Share' }}
            </button>
            <button class="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100" @click="handleRenameProject(project.id, project.name)">
              Rename
            </button>
            <button class="inline-flex rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-100" @click="handleDeleteProject(project.id, project.name)">
              Delete
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>