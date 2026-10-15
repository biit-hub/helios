"use client";
import type { DocumentModel } from "./use-task-document";

export function DocumentLinks({ model }: Readonly<{ model: DocumentModel }>) {
  const {
    detail,
    setPreview,
    linkLabel,
    setLinkLabel,
    linkUrl,
    setLinkUrl,
    linkTarget,
    setLinkTarget,
    pending,
    propose,
  } = model;
  return (
    <>
      {" "}
      <h3>Dokumentenlinks</h3>
      {detail.inspection.links.map((l) => (
        <p key={l.url + ":" + l.label}>
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>{" "}
          <button
            type="button"
            disabled={pending || detail.inspection.task.checked}
            onClick={() => {
              setLinkTarget(l.url);
              setLinkLabel(l.label);
              setLinkUrl(l.url);
              setPreview(null);
            }}
          >
            Link bearbeiten
          </button>
        </p>
      ))}
      <fieldset disabled={pending || detail.inspection.task.checked}>
        <label>
          <span>Linkbezeichnung</span>
          <input
            value={linkLabel}
            onChange={(e) => {
              setLinkLabel(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <label>
          <span>Dokumentenadresse (HTTP, HTTPS oder Obsidian)</span>
          <input
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!linkLabel.trim() || !linkUrl.trim()}
          onClick={() =>
            void propose(
              linkTarget
                ? {
                    kind: "link-edit",
                    target: linkTarget,
                    label: linkLabel,
                    url: linkUrl,
                  }
                : { kind: "link-add", label: linkLabel, url: linkUrl },
            )
          }
        >
          {linkTarget ? "Linkänderung prüfen" : "Neuen Link prüfen"}
        </button>
        {linkTarget && (
          <button
            type="button"
            onClick={() => {
              setLinkTarget("");
              setLinkLabel("");
              setLinkUrl("");
              setPreview(null);
            }}
          >
            Neuen Link erfassen
          </button>
        )}
      </fieldset>
    </>
  );
}
