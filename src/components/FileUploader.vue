<script setup lang="ts">
import { ref } from "vue"
import heic2any from "heic2any"

const previews = ref<{ url: string; type: string; name: string }[]>([])

function getMimeType(file: File) {
  if (file.type) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext) return "application/octet-stream"

  switch (ext) {
    case "heic":
      return "image/heic"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "gif":
      return "image/gif"
    case "webp":
      return "image/webp"
    case "mp4":
    case "mov":
    case "avi":
    case "mkv":
      return "video/mp4"
    default:
      return "application/octet-stream"
  }
}

async function createPreview(file: File): Promise<string> {
  const mime = getMimeType(file)

  if (mime.startsWith("image/") && mime !== "image/heic") {
    return URL.createObjectURL(file)
  }

  if (mime === "image/heic") {
    const blob = (await heic2any({ blob: file, toType: "image/jpeg" })) as Blob
    return URL.createObjectURL(blob)
  }

  if (mime.startsWith("video/")) {
    return await getVideoThumbnail(file)
  }

  return ""
}

function getVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.src = URL.createObjectURL(file)
    video.muted = true
    video.playsInline = true

    video.onloadeddata = () => {
      video.currentTime = 0.1
    }

    video.onseeked = () => {
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg"))
      } else {
        resolve("")
      }
      URL.revokeObjectURL(video.src)
    }
  })
}

async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return

  previews.value = []
  for (const file of input.files) {
    const url = await createPreview(file)
    previews.value.push({ url, type: getMimeType(file), name: file.name })
  }
}
</script>

<template>
  <div>
    <input type="file" multiple @change="handleFiles" />
    <div class="grid grid-cols-3 gap-2 mt-4">
      <div
        v-for="p in previews"
        :key="p.name"
        class="border rounded p-2 flex flex-col items-center"
      >
        <template v-if="p.type.startsWith('image/')">
          <img :src="p.url" class="w-32 h-32 object-cover" />
        </template>
        <template v-else-if="p.type.startsWith('video/')">
          <img :src="p.url" class="w-32 h-32 object-cover" />
          <span class="text-xs mt-1">🎬 {{ p.name }}</span>
        </template>
        <template v-else>
          <span class="text-xs">📄 {{ p.name }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
