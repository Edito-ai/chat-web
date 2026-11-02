'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '../lib/markdown'

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-ink-0">
            {renderInline(n.children)}
          </strong>
        )
      case 'em':
        return <em key={i}>{renderInline(n.children)}</em>
      case 'code':
        return (
          <code key={i} className="rounded bg-black/30 px-1 py-0.5 text-caption">
            {n.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-0 underline underline-offset-2"
          >
            {renderInline(n.children)}
          </a>
        )
    }
  })
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-1 mb-3 text-title font-semibold text-ink-0',
  2: 'mt-5 mb-2 text-title font-semibold text-ink-0',
  3: 'mt-4 mb-1.5 text-body font-semibold text-ink-0',
  4: 'mt-3 mb-1 text-label font-semibold text-ink-0',
  5: 'mt-3 mb-1 text-label font-semibold text-ink-1',
  6: 'mt-3 mb-1 text-label font-medium text-ink-1',
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const Tag = `h${b.level}` as 'h1'
      return (
        <Tag key={i} className={HEADING_CLASS[b.level]}>
          {renderInline(b.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={i} className="my-2 text-label leading-relaxed text-ink-2">
          {renderInline(b.children)}
        </p>
      )
    case 'quote':
      return (
        <blockquote
          key={i}
          role="note"
          className="my-3 rounded-lg border border-line-strong bg-white/[0.04] px-3 py-2 text-label leading-relaxed text-ink-1"
        >
          {renderInline(b.children)}
        </blockquote>
      )
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul'
      return (
        <Tag
          key={i}
          className={`my-2 space-y-1 pl-5 text-label leading-relaxed text-ink-2 ${b.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div key={i} className="my-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-caption text-ink-2">
            <thead className="bg-white/[0.04] text-ink-1">
              <tr>
                {b.header.map((c, j) => (
                  <th key={j} className="border-b border-line px-2 py-1.5 font-semibold">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="align-top">
                  {row.map((c, j) => (
                    <td key={j} className="border-t border-line px-2 py-1.5">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'rule':
      return <hr key={i} className="my-4 border-line" />
  }
}

/** Renders Markdown text (the backend's legal documents) as structured, non-injectable React. */
export function MarkdownView({ markdown, testId }: { markdown: string; testId?: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown])
  return <div data-testid={testId}>{blocks.map(renderBlock)}</div>
}
