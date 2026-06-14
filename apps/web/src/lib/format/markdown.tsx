"use client";

import { Fragment, type ReactNode } from "react";
import { wrapW } from "./text";

/**
 * Lightweight markdown renderer for the file viewer and Taizi reply panels.
 * Ported from apps/tui/src/markdown.ts (which emitted ANSI strings); here it
 * emits React nodes with Tailwind classes mirroring the terminal styling:
 *   - # / ## headers → cyan bold block markers
 *   - ---            → dim rule
 *   - ``` fences     → dim code block
 *   - - / * bullets  → cyan • markers
 *   - 1. ordered     → cyan markers
 *   - > quote        → dim ▏ prefix
 *   - inline **bold** / *italic* / `code`
 */

/** Parse inline **bold**, *italic*, `code` into React nodes. */
function mdInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenize by walking regex alternation; preserve order.
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    if (match[2] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${i++}`} className="font-bold">
          {match[2]}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <em key={`${keyBase}-i${i++}`} className="italic">
          {match[3]}
        </em>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={`${keyBase}-c${i++}`} className="text-term-cyan">
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

/** Render markdown content as a list of React nodes (one per output line). */
export function renderMarkdown(content: string, width = 100): ReactNode[] {
  const out: ReactNode[] = [];
  let inCode = false;
  let lineNo = 0;
  const key = () => `md-${lineNo++}`;

  const pushWrapped = (
    text: string,
    firstPrefix: ReactNode,
    contPrefix: ReactNode,
    className: string,
    inline: boolean,
  ): void => {
    const firstW = prefixWidth(firstPrefix);
    const avail = Math.max(16, width - firstW);
    const pieces = wrapW(text, avail);
    if (pieces.length === 0) {
      out.push(
        <div key={key()} className={className}>
          {firstPrefix}
        </div>,
      );
      return;
    }
    pieces.forEach((piece, index) => {
      out.push(
        <div key={key()} className={className}>
          {index === 0 ? firstPrefix : contPrefix}
          {inline ? mdInline(piece, `md-r${lineNo}`) : piece}
        </div>,
      );
    });
  };

  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      out.push(
        <div key={key()} className="text-term-dim">
          {"─".repeat(Math.min(40, width))}
        </div>,
      );
      continue;
    }
    if (inCode) {
      out.push(
        <div key={key()} className="text-term-dim pl-2 whitespace-pre-wrap break-all">
          {raw}
        </div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      if (level === 1) {
        out.push(<div key={key()}>&nbsp;</div>);
        pushWrapped(text, <span className="text-term-cyan">█ </span>, <span>&nbsp;&nbsp;</span>, "font-bold text-term-cyan", true);
      } else if (level === 2) {
        out.push(<div key={key()}>&nbsp;</div>);
        pushWrapped(text, <span className="text-term-cyan">▎</span>, <span>&nbsp;</span>, "font-bold text-term-cyan", true);
      } else {
        const indent = "  ".repeat(level - 3);
        pushWrapped(text, <span>{indent}</span>, <span>{indent}</span>, "font-bold", true);
      }
      continue;
    }
    if (/^\s*([-*_]){3,}\s*$/.test(raw)) {
      out.push(
        <div key={key()} className="text-term-dim">
          {"─".repeat(Math.min(40, width))}
        </div>,
      );
      continue;
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (bullet) {
      const indent = bullet[1]!;
      pushWrapped(
        bullet[2]!,
        <span className="text-term-cyan">{indent}• </span>,
        <span>{indent}&nbsp;&nbsp;</span>,
        "",
        true,
      );
      continue;
    }
    const ordered = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw);
    if (ordered) {
      const indent = ordered[1]!;
      const marker = `${ordered[2]}.`;
      pushWrapped(
        ordered[3]!,
        <span className="text-term-cyan">{indent}{marker} </span>,
        <span>{indent}{" ".repeat(marker.length + 1)}</span>,
        "",
        true,
      );
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(raw);
    if (quote) {
      pushWrapped(
        quote[1]!,
        <span className="text-term-dim">▏ </span>,
        <span className="text-term-dim">▏ </span>,
        "text-term-dim",
        true,
      );
      continue;
    }
    pushWrapped(raw, null, null, "", true);
  }
  return out;
}

/** Estimate the display width of a prefix node (string children only). */
function prefixWidth(node: ReactNode): number {
  if (node == null || typeof node === "boolean") return 0;
  if (typeof node === "string") return node.length;
  if (Array.isArray(node)) return node.reduce((sum, n) => sum + prefixWidth(n), 0);
  return 0;
}
