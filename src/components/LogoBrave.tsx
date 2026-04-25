'use client'
import { useEffect, useState } from 'react'

export default function LogoBrave({ height = 32 }: { height?: number }) {
  const [src, setSrc] = useState('/brave-logo.png')

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < d.data.length; i += 4) {
        const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2]
        if (r > 230 && g > 230 && b > 230) d.data[i + 3] = 0
      }
      ctx.putImageData(d, 0, 0)
      setSrc(canvas.toDataURL())
    }
    img.src = '/brave-logo.png'
  }, [])

  return <img src={src} alt="Brave" style={{ height, objectFit: 'contain' }} />
}
