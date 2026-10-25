import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from "docx";
import writeXlsxFile from "write-excel-file/node";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AiJobFormat } from "@helios/contracts";
import type { JobAnswer } from "./generation";
import { WorkFault } from "../work/service";

type FileContent = NonNullable<
  Extract<JobAnswer, { kind: "result" }>["document"]
>;
const mimeTypes = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
};
const plain = (s: string) =>
  s
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
export const csvCell = (s: string) => {
  const value = plain(s);
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
};
const markdownText = (s: string) =>
  plain(s)
    .replaceAll(/[\\`*_{}[\]()#+.!|>~-]/g, String.raw`\$&`)
    .replaceAll(/[&<]/g, (character) => (character === "&" ? "&amp;" : "&lt;"));
async function pdf(content: FileContent) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(new URL("./assets/NotoSans-Regular.ttf", import.meta.url)),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  const paragraphs = [
    content.title,
    ...content.paragraphs,
    ...(content.columns.length
      ? [content.columns.join(" | "), ...content.rows.map((r) => r.join(" | "))]
      : []),
  ];
  let page = doc.addPage([595, 842]);
  let y = 790;
  function line(text: string) {
    if (y < 50) {
      if (doc.getPageCount() >= 100)
        throw new WorkFault("AI_JOB_FILE_LIMIT", 409);
      page = doc.addPage([595, 842]);
      y = 790;
    }
    page.drawText(text, { x: 45, y, font, size: 11 });
    y -= 16;
  }
  const widths = new Map<string, number>();
  function drawParagraph(p: string) {
    let current = "";
    let currentWidth = 0;
    for (const ch of plain(p).replaceAll("\t", "    ")) {
      if (ch !== "\n" && !supported.has(ch.codePointAt(0)!))
        throw new WorkFault("AI_JOB_FILE_CHARACTERS", 409);
      if (ch === "\n") {
        line(current);
        current = "";
        currentWidth = 0;
        continue;
      }
      let width = widths.get(ch);
      if (width === undefined) {
        width = font.widthOfTextAtSize(ch, 11);
        widths.set(ch, width);
      }
      if (currentWidth + width > 505) {
        line(current);
        current = "";
        currentWidth = 0;
      }
      current += ch;
      currentWidth += width;
    }
    line(current);
  }
  for (const p of paragraphs) {
    drawParagraph(p);
    y -= 8;
  }
  return Buffer.from(await doc.save());
}
export async function renderJobFile(
  id: string,
  number: number,
  format: AiJobFormat,
  content: FileContent,
) {
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    throw new WorkFault("AI_JOB_INVALID_OUTPUT", 502);
  const table = content.columns.length
    ? [content.columns, ...content.rows]
    : [];
  let data: Buffer;
  if (format === "docx") {
    data = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: plain(content.title),
                heading: "Heading1",
              }),
              ...content.paragraphs.map((s) => new Paragraph(plain(s))),
              ...(table.length
                ? [
                    new Table({
                      rows: table.map(
                        (row) =>
                          new TableRow({
                            children: row.map(
                              (cell) =>
                                new TableCell({
                                  children: [new Paragraph(plain(cell))],
                                }),
                            ),
                          }),
                      ),
                    }),
                  ]
                : []),
            ],
          },
        ],
      }),
    );
  } else if (format === "xlsx") {
    const rows = [
      [content.title],
      ...content.paragraphs.map((s) => [s]),
      ...table,
    ];
    data = await writeXlsxFile(
      rows.map((row) =>
        row.map((value) => ({ type: String, value: plain(value) })),
      ),
      { sheet: "Ergebnis" },
    ).toBuffer();
  } else if (format === "pdf") data = await pdf(content);
  else if (format === "csv") {
    const rows = table.length
      ? table
      : [[content.title], ...content.paragraphs.map((s) => [s])];
    data = Buffer.from(
      "\uFEFF" +
        rows.map((r) => r.map(csvCell).join(",")).join("\r\n") +
        "\r\n",
    );
  } else {
    const lines = [
      "# " + markdownText(content.title),
      ...content.paragraphs.map(markdownText),
    ];
    if (table.length)
      lines.push(
        "| " + content.columns.map(markdownText).join(" | ") + " |",
        "| " + content.columns.map(() => "---").join(" | ") + " |",
        ...content.rows.map(
          (r) => "| " + r.map(markdownText).join(" | ") + " |",
        ),
      );
    data = Buffer.from(lines.join("\n\n") + "\n");
  }
  if (!data.length || data.length > 10485760)
    throw new WorkFault("AI_JOB_FILE_LIMIT", 409);
  return {
    data,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    filename: `helios-${id}-${number}.${format}`,
    mime: mimeTypes[format],
  };
}
