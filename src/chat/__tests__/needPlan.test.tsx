import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NeedPlanNotice } from '../NeedPlanNotice'

const html = (show: boolean) => renderToStaticMarkup(createElement(NeedPlanNotice, { show }))

describe('NeedPlanNotice (there is no self-serve free credit any more)', () => {
  it('shows nothing until an edit was refused for lack of a plan', () => {
    expect(html(false)).toBe('')
  })

  it('then says who to ask, by mail and on WhatsApp, and offers no phone-number claim form', () => {
    const out = html(true)
    expect(out).toContain('data-testid="chat-need-credit"')
    expect(out).toContain('href="mailto:hello@trybroll.com"')
    expect(out).toContain('href="https://wa.me/918595051170?text=')
    expect(out).not.toContain('credit-phone')
    expect(out).not.toContain('Claim')
  })
})
