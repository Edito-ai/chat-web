import type { CardVerifyOrder, CardVerifyPayment } from '../types'

/**
 * Razorpay Checkout (the card / UPI modal) for the card-verification credit.
 *
 * The script is loaded only when the person presses the button, never with the page. The server made the order (₹1, INR) and
 * the Razorpay key id comes with it, so nothing about Razorpay is configured in the browser.
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

/** The person closed the checkout without paying. Not an error: the screen just goes back to the button. */
export class CheckoutDismissed extends Error {
  constructor() {
    super('checkout dismissed')
    this.name = 'CheckoutDismissed'
  }
}

interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open: () => void
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayCtor
  }
}

let loading: Promise<void> | null = null

/** Loads `checkout.js` once. Resolves at once when it is already there (a second claim, or a test that stubs `window.Razorpay`). */
export function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout needs a browser.'))
  if (window.Razorpay) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error('Checkout did not load.')))
    script.onerror = () => {
      script.remove()
      loading = null // a later press may try again
      reject(new Error('Failed to fetch the payment window.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/** Opens the modal for `order` (card and UPI only) and resolves with what Razorpay hands back after a paid checkout. */
export async function openCardCheckout({ order, email }: { order: CardVerifyOrder; email?: string | null }): Promise<CardVerifyPayment> {
  await loadCheckout()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error('Checkout did not load.')
  return new Promise<CardVerifyPayment>((resolve, reject) => {
    const rz = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Edito',
      description: 'Verify your card or UPI (refunded right away)',
      prefill: email ? { email } : undefined,
      // Only the two ways that prove a real Indian card or UPI id.
      method: { card: true, upi: true, netbanking: false, wallet: false, emi: false, paylater: false },
      theme: { color: '#D8264A' },
      handler: (r: RazorpayResponse) =>
        resolve({ razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature }),
      modal: { ondismiss: () => reject(new CheckoutDismissed()) },
    })
    rz.open()
  })
}
