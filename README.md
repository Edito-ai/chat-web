# chat-web

Standalone web client for Edito **chat edit**: add videos, describe the edit in a chat, watch progress, get the
finished video back with a player and a Download button, then ask for changes ("make the captions bigger").
No timeline, no Electron, no dependency on the editor repo. The backend does all the editing
(`/chat/*` in the Edito backend, `app/features/chat_edit`).

Stack: Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind (same monochrome tokens as the editor), Zustand, Vitest.
Public site: `/` is a server-rendered marketing page (title, description, OpenGraph, JSON-LD, `robots.txt`, `sitemap.xml`); the app itself is client-side.
Languages: English and Hindi (`src/i18n`).

## Configuration

Copy `.env.example` to `.env` (never committed):

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Edito backend base URL. Default `http://127.0.0.1:4000`. |
| `NEXT_PUBLIC_SITE_URL` | Public origin of this site, for canonical/OpenGraph URLs, robots and sitemap. Default `http://localhost:5174`. Set it in production. |
| `NEXT_PUBLIC_EDITOR_URL` | Optional. If set, a finished video shows an "Open in editor" link to this URL. Hidden when empty. |

`NEXT_PUBLIC_*` values are inlined at build time, so set them before `npm run build`.

## Run

```
npm install
npm run dev        # http://localhost:5174
npm run lint       # tsc --noEmit + next lint
npm run test       # vitest
npm run build      # production build into .next/
npm run start      # serve the production build on :5174
```

## How it talks to the backend

- **Auth**: `POST /auth/login`, `/auth/signup` (then `/auth/otp/verify` with the emailed code), `/auth/refresh`,
  `/auth/logout`, `GET /auth/me`. Requests carry `Authorization: Bearer <access token>`. On a 401 the client does
  exactly one silent refresh (shared between concurrent callers) and retries once. Tokens live in `localStorage`
  and the refresh token is sent in the request body; no cookies are used (`credentials: 'omit'`), so CORS needs no
  credentials mode. Trade-off: a script running on the page can read the refresh token, so keep the app free of
  third-party scripts.
- **Upload**: `POST /projects` creates a project whose shape follows the first video (portrait 1080x1920,
  landscape 1920x1080, square 1080x1080). Each video then goes up with `POST /projects/{id}/media` (small files)
  or the resumable chunked route straight to R2 (`/projects/{id}/uploads`, `/uploads/{id}/parts/{n}/url`,
  `/uploads/{id}/complete`; files over 8 MB). The returned asset id is the `videoId`.
  Duration and size are probed in the browser. `hasAudio` is only sent as a real value when the browser can tell
  (Chrome/Edge do not expose `audioTracks`); otherwise `true` is sent and the server's ffprobe is authoritative.
- **Chat**: `POST /chat/jobs`, `GET /chat/jobs/{id}` (polled every 2 s, backs off on errors),
  `POST /chat/jobs/{id}/followup`, `POST /chat/jobs/{id}/cancel`. The transcript and job id are persisted so a reload
  resumes the running job and refreshes the expired video link. Another account's transcript is dropped.

Contract summary: all JSON is camelCase; job `state` is `queued -> analyzing -> planning -> assembling -> rendering ->
complete | failed | cancelled`; `previewUrl`/`downloadUrl` are short-lived presigned links, fresh on every GET; a
follow-up is only allowed when `canFollowUp` is true. Rendering needs a running export worker on the backend.

## Backend requirements

- CORS: in development the backend allows any `http://localhost|127.0.0.1:<port>` origin. In production
  `CORS_ORIGIN` is a single origin, so the chat-web origin must be added there.
- The R2 bucket CORS policy must allow `PUT` from the chat-web origin and expose the `ETag` header.

## Routes

| Route | What |
|---|---|
| `/` | Landing page (server component, indexable). |
| `/login` | Log in / sign up / 6-digit emailed code. Already signed in: redirects to `/chat`. |
| `/chat` | The chat app. No session: redirects to `/login`. Both pages are `noindex`. |

The session gate is client-side (tokens live in `localStorage`, which the server cannot see), so the server always
answers `/chat` with 200 and a "restoring session" shell, and the browser then redirects. Browser-only state
(`localStorage`, `navigator`) is read only after mount (`useSession`, `LocaleSync`), so server HTML and the first client
render match.

## Account menu (sidebar footer)

The footer circle opens a menu: plan badge (`GET /billing/entitlement`: Free, Pro · Weekly, Pro · Monthly, Trial with end date),
Usage, Plan & billing, Pricing / Upgrade, Help & support, Legal, Language (EN / हिं), Open the editor and Admin (both only when
`NEXT_PUBLIC_EDITOR_URL` is set; Admin also needs `isAdmin` from `/auth/me`), Sign out. Code is in `src/account/`.

Endpoints: `GET /billing/{entitlement,subscription,token-usage,free-credit,weekly-pass,weekly-pass/pricing}`,
`POST /billing/{checkout-session,trial/checkout-session,subscription/cancel,weekly-pass/order,weekly-pass/{id}/sync}`,
`GET /legal`, `GET /legal/{slug}`, `POST /support/tickets`.

Monthly prices ($50 Creator, $100 Studio) are constants in `src/account/lib/plans.ts`: the backend does not serve them
(`tiers.py`), the editor hard-codes the same numbers. The Weekly Pass price comes from the backend. Cancel is immediate
on the backend (`cancel_subscription_now` sets status `canceled`), and the confirm step says so.

### Payments returning to chat-web

Checkout opens in a new tab. The URL the backend returns is built from its `APP_BASE_URL` setting
(`cashfree_client.hosted_checkout_url` -> `{APP_BASE_URL}/checkout?...` for Cashfree, `payment_result_url` ->
`{APP_BASE_URL}/payment/result` as the return URL; Razorpay returns its own hosted page). `APP_BASE_URL` is the editor web
app's origin (also used for password-reset links), and `/checkout` and `/payment/result` are pages of the editor, not of
chat-web. So with no change, payment works end to end but happens in the editor origin: the tab opens on the editor's
`/checkout`, and returns to the editor's `/payment/result`. Closing that tab and pressing Refresh in Plan & billing (or
reopening the menu) picks up the new plan. To make payments return to chat-web instead, all of these are needed:

1. chat-web must implement `/checkout` (launch the Cashfree JS SDK with `kind`, `session`, `mode`) and `/payment/result`
   (poll `GET /billing/payment-status?kind&id`). Not built.
2. Backend `APP_BASE_URL` set to the chat-web origin (this also moves password-reset links; there is no separate setting).
3. Backend `CORS_ORIGIN` to include the chat-web origin (it is a single value in production), and the same origin
   whitelisted in the Cashfree / Razorpay dashboard for return and checkout domains.
4. Set `NEXT_PUBLIC_API_BASE_URL` to the backend as already required.

Dev preview fixtures for the menu and every dialog: `/dev/preview?s=acct-free|acct-weekly|acct-trial|acct-exceeded|acct-cancelend|acct-failed`
with `&open=usage|billing|help|legal` (money calls in fixtures throw; nothing reaches a backend).

## Possible improvement (not built)

Move the refresh token into an `HttpOnly; Secure; SameSite` cookie set by the backend, and let Next middleware gate
`/chat` on the server. That removes the token from script-readable storage and avoids the loading shell, but it needs
backend changes (cookie issuing, CORS credentials mode, CSRF handling), so it is left as is.

## Layout

```
src/app/     Next App Router: layout, landing page, /login, /chat, robots, sitemap, OG image
src/auth/    login / signup / code screen and the session store
src/chat/    chat store, state reducer, API adapter, upload path, probe, ChatScreen, tests
src/lib/     apiClient (bearer + one refresh retry), friendlyError, env
src/i18n/    en / hi strings and the tiny useT hook
src/components/ui.tsx  Button, IconButton, Logo, InlineError; Dialog.tsx modal with focus trap
src/account/ account menu: services/, lib/, components/ (dialogs), store, __tests__/
```
