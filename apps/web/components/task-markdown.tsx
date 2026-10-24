import { Fragment, type ReactNode } from "react";

export function displayUrl(value: string) {
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      (["http:", "https:"].includes(url.protocol)
        ? !!url.hostname
        : url.protocol === "obsidian:" &&
          ["open", "advanced-uri"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
function inline(value: string): ReactNode[] {
  return value
    .split(
      /(\[[^\]\n]{1,500}\]\([^\)\n]{1,2000}\)|\*\*[^*\n]{1,1000}\*\*|`[^`\n]{1,1000}`)/g,
    )
    .map((part, i) => {
      if (part.startsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith("[")) {
        const end = part.indexOf("](");
        const raw = part.slice(end + 2, -1),
          url =
            raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
        if (end > 0 && displayUrl(url))
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              {part.slice(1, end)}
            </a>
          );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
}
// Deliberately render text, never HTML, images or embedded remote content.
// Unsupported Markdown remains readable verbatim.
export function TaskMarkdown({ text }: Readonly<{ text: string }>) {
  return (
    <div className="task-markdown">
      {text.split(/\r?\n/).map((line, i) => {
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading)
          return (
            <p className="task-markdown-heading" key={i}>
              {inline(heading[2]!)}
            </p>
          );
        const item = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (item)
          return (
            <p className="task-markdown-item" key={i}>
              • {inline(item[1]!)}
            </p>
          );
        return <p key={i}>{line ? inline(line) : <br />}</p>;
      })}
    </div>
  );
}
