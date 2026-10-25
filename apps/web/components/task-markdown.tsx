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
function keyed(values: string[]) {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const occurrence = seen.get(value) ?? 0;
    seen.set(value, occurrence + 1);
    return { value, key: value + ":" + occurrence };
  });
}
function inline(value: string): ReactNode[] {
  return keyed(
    value.split(
      /(\[[^\]\n]{1,500}\]\([^)\n]{1,2000}\)|\*\*[^*\n]{1,1000}\*\*|`[^`\n]{1,1000}`)/g,
    ),
  ).map(({ value: part, key }) => {
    if (part.startsWith("**"))
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[")) {
      const end = part.indexOf("](");
      const raw = part.slice(end + 2, -1),
        url = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
      if (end > 0 && displayUrl(url))
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer">
            {part.slice(1, end)}
          </a>
        );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}
// Deliberately render text, never HTML, images or embedded remote content.
// Unsupported Markdown remains readable verbatim.
export function TaskMarkdown({ text }: Readonly<{ text: string }>) {
  return (
    <div className="task-markdown">
      {keyed(text.replaceAll("\r\n", "\n").split("\n")).map(
        ({ value: line, key }) => {
          const heading = /^(#{1,6})(?=\s)/.exec(line);
          if (heading) {
            const content = line.slice(heading[1]!.length).trimStart();
            if (content)
              return (
                <p className="task-markdown-heading" key={key}>
                  {inline(content)}
                </p>
              );
          }
          const trimmed = line.trimStart();
          if (
            ["-", "*", "+"].includes(trimmed[0] ?? "") &&
            /\s/.test(trimmed[1] ?? "")
          )
            return (
              <p className="task-markdown-item" key={key}>
                • {inline(trimmed.slice(1).trimStart())}
              </p>
            );
          return <p key={key}>{line ? inline(line) : <br />}</p>;
        },
      )}
    </div>
  );
}
