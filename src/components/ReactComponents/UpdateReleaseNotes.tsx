import type { ReactNode } from "react";

interface Props {
  notes: string;
}

function httpsLink(destination: string): string | undefined {
  // Support the optional title used in GitHub Markdown without interpreting HTML.
  const match = destination.trim().match(/^<?(https:\/\/[^\s<>]+?)>?(?:\s+"[^"\n]*")?$/i);
  if (!match) return;
  try {
    const url = new URL(match[1]);
    if (url.protocol === "https:") return url.href;
  } catch {
    // Malformed destinations remain readable text.
  }
}

function inline(text: string, allowLinks = true, depth = 0): ReactNode {
  if (depth >= 8) return text;
  const tokens = /`([^`\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g;
  const result: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(tokens)) {
    if (match.index > end) result.push(text.slice(end, match.index));
    const key = match.index;
    if (match[1] !== undefined) {
      result.push(<code key={key}>{match[1]}</code>);
    } else if (match[2] !== undefined || match[3] !== undefined) {
      result.push(<strong key={key}>{inline(match[2] ?? match[3], allowLinks, depth + 1)}</strong>);
    } else if (match[4] === "!") {
      // Never create an image element or request release-note image URLs.
      result.push(match[5]);
    } else {
      const href = allowLinks ? httpsLink(match[6]) : undefined;
      const label = inline(match[5], false, depth + 1);
      result.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          label
        )
      );
    }
    end = match.index + match[0].length;
  }
  if (end < text.length) result.push(text.slice(end));
  return result;
}

function listItem(line: string) {
  return line.match(/^\s*(?:([-+*])|([0-9]{1,9})[.)])\s+(.+)$/);
}

function heading(line: string) {
  return line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
}

function codeFence(line: string) {
  return line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
}

export default function UpdateReleaseNotes({ notes }: Props) {
  const lines = notes.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    const key = index;
    const fence = codeFence(line);
    if (fence) {
      const content: string[] = [];
      index++;
      while (index < lines.length) {
        const closing = codeFence(lines[index]);
        if (
          closing &&
          closing[1][0] === fence[1][0] &&
          closing[1].length >= fence[1].length &&
          !closing[2].trim()
        ) {
          break;
        }
        content.push(lines[index++]);
      }
      const finalNewline = index < lines.length && content.length > 0 ? "\n" : "";
      blocks.push(
        <pre key={key}>
          <code>{content.join("\n") + finalNewline}</code>
        </pre>
      );
      if (index < lines.length) index++;
      continue;
    }

    const title = heading(line);
    if (title) {
      blocks.push(<h3 key={key}>{inline(title[1])}</h3>);
      index++;
      continue;
    }

    const first = listItem(line);
    if (first) {
      const ordered = first[2] !== undefined;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = listItem(lines[index]);
        if (!item || (item[2] !== undefined) !== ordered) break;
        const itemKey = index++;
        const content = [item[3]];
        while (
          index < lines.length &&
          /^\s+\S/.test(lines[index]) &&
          !listItem(lines[index]) &&
          !heading(lines[index]) &&
          !codeFence(lines[index])
        ) {
          content.push(lines[index++].trim());
        }
        items.push(<li key={itemKey}>{inline(content.join(" "))}</li>);
      }
      blocks.push(
        ordered ? (
          <ol key={key} start={Number(first[2]) === 1 ? undefined : Number(first[2])}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        )
      );
      continue;
    }

    const paragraph = [line.trim()];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !heading(lines[index]) &&
      !listItem(lines[index]) &&
      !codeFence(lines[index])
    ) {
      paragraph.push(lines[index++].trim());
    }
    blocks.push(<p key={key}>{inline(paragraph.join(" "))}</p>);
  }

  return <div className="sl-update-notes-content">{blocks}</div>;
}
