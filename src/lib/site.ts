const DEFAULT_URL = process.env.NODE_ENV === 'production' ? 'https://chat.trybroll.com' : 'http://localhost:5174'

/** Public origin of this site (canonical URLs, OpenGraph, sitemap). NEXT_PUBLIC_SITE_URL overrides the default. */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_URL).replace(/\/+$/, '')
export const SITE_NAME = 'Broll Chat Edit'
export const SITE_DESCRIPTION =
  'Upload a video, describe the edit in plain words, and get the finished video back. Captions, B-roll, colour grade and cuts, done by chat.'
