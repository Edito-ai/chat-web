/** Backend base URL. 127.0.0.1 (not localhost) in the fallback: uvicorn listens on IPv4 loopback only. */
export const API_BASE: string = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '')

/** The Google OAuth "Web application" client id. Empty = the "Continue with Google" button is not shown. */
export const GOOGLE_CLIENT_ID: string = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim()

/** Where the full editor lives; the "Open in editor" link is hidden when this is empty. */
export const EDITOR_URL: string = (process.env.NEXT_PUBLIC_EDITOR_URL || '').trim()
