'use client'

import { useRef, useState } from 'react'
import { Camera, Upload, X, Loader2, MapPin } from 'lucide-react'
import { UPLOAD_LIMITS } from '@sentinel/shared'

interface PhotoUploadProps {
  onUpload: (file: File, coords?: { lat: number; lng: number }) => Promise<string>
  onRemove?: (url: string) => void
  maxPhotos?: number
  label?: string
}

interface UploadedPhoto {
  url: string
  coords?: { lat: number; lng: number }
}

export function PhotoUpload({
  onUpload,
  onRemove,
  maxPhotos = 5,
  label = 'Add photos',
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    if (photos.length + files.length > maxPhotos) {
      setError(`Maximum ${maxPhotos} photos allowed`)
      return
    }

    setError(null)
    setUploading(true)

    try {
      for (const raw of Array.from(files)) {
        if (!raw.type.startsWith('image/')) {
          setError('Only image files are supported')
          continue
        }
        if (raw.size > UPLOAD_LIMITS.PHOTO_MAX_BYTES) {
          setError('Photo must be under 10 MB')
          continue
        }

        // 1. Extract EXIF GPS coordinates
        let coords: { lat: number; lng: number } | undefined
        try {
          const exifr = (await import('exifr')).default
          const gps = await exifr.gps(raw)
          if (gps?.latitude && gps?.longitude) {
            coords = { lat: gps.latitude, lng: gps.longitude }
          }
        } catch {
          // No EXIF GPS — fall back to browser geolocation (caller responsibility)
        }

        // 2. Compress client-side using Canvas
        const compressed = await compressImage(raw)

        // 3. Upload
        const url = await onUpload(compressed, coords)
        setPhotos((prev) => [...prev, { url, coords }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleRemove(url: string) {
    setPhotos((prev) => prev.filter((p) => p.url !== url))
    onRemove?.(url)
  }

  return (
    <div className="space-y-3">
      {/* Upload area */}
      {photos.length < maxPhotos && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex gap-2">
            {/* Camera (mobile primary) */}
            <button
              type="button"
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.capture = 'environment'
                  inputRef.current.click()
                }
              }}
              disabled={uploading}
              className="flex-1 flex flex-col items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin text-blue-500" />
              ) : (
                <Camera size={20} className="text-slate-400" />
              )}
              <span className="text-xs text-slate-500">
                {uploading ? 'Uploading…' : 'Take photo'}
              </span>
            </button>

            {/* File picker (desktop) */}
            <button
              type="button"
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.removeAttribute('capture')
                  inputRef.current.click()
                }
              }}
              disabled={uploading}
              className="flex-1 flex flex-col items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-50"
            >
              <Upload size={20} className="text-slate-400" />
              <span className="text-xs text-slate-500">{label}</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map(({ url, coords }) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />

              {/* GPS badge */}
              {coords && (
                <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                  <MapPin size={10} className="text-green-400" />
                  <span className="text-white text-[10px]">GPS</span>
                </div>
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(url)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compress an image to max 1.5 MB using the Canvas API — no libraries needed */
async function compressImage(file: File): Promise<File> {
  if (file.size <= UPLOAD_LIMITS.PHOTO_COMPRESSED_MAX_BYTES) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const { naturalWidth, naturalHeight } = img
      const maxDim = UPLOAD_LIMITS.PHOTO_MAX_DIMENSION
      let w = naturalWidth
      let h = naturalHeight

      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))

      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression failed'))
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }))
        },
        'image/jpeg',
        UPLOAD_LIMITS.PHOTO_COMPRESSED_QUALITY
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}
