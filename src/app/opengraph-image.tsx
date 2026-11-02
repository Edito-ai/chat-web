import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/site'

export const alt = `${SITE_NAME}: edit your video by chatting`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#050506',
          color: '#F6F6F4',
        }}
      >
        <div style={{ fontSize: 34, color: '#9B9BA3', marginBottom: 24 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>Describe the edit.</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, color: '#9B9BA3' }}>Get the video back.</div>
      </div>
    ),
    size,
  )
}
