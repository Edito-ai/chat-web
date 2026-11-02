/** Public origin of this site (canonical URLs, OpenGraph, sitemap). Set NEXT_PUBLIC_SITE_URL in production. */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5174').replace(/\/+$/, '')
export const SITE_NAME = 'Broll Chat Edit'
export const SITE_DESCRIPTION =
  'Upload a video, describe the edit in plain words, and get the finished video back. Captions, B-roll, colour grade and cuts, done by chat.'
