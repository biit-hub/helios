"use client";
import { Button, FormField, Input } from "@helios/ui";
import { TaskAccordion } from "./task-accordion";
import { displayUrl } from "./task-markdown";
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
      <TaskAccordion title="Dokumentenlinks">
        {detail.inspection.links.map((l) => (
          <p key={l.url + ":" + l.label}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>{" "}
            <Button
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
            </Button>
          </p>
        ))}
        <fieldset disabled={pending || detail.inspection.task.checked}>
          <FormField>
            <span>Linkbezeichnung</span>
            <Input
              value={linkLabel}
              onChange={(e) => {
                setLinkLabel(e.target.value);
                setPreview(null);
              }}
            />
          </FormField>
          <FormField>
            <span>Dokumentenadresse (HTTP, HTTPS oder Obsidian)</span>
            <Input
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setPreview(null);
              }}
            />
          </FormField>
          <Button
            type="button"
            disabled={!linkLabel.trim() || !displayUrl(linkUrl)}
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
          </Button>
          {linkTarget && (
            <Button
              type="button"
              onClick={() => {
                setLinkTarget("");
                setLinkLabel("");
                setLinkUrl("");
                setPreview(null);
              }}
            >
              Neuen Link erfassen
            </Button>
          )}
        </fieldset>
      </TaskAccordion>
    </>
  );
}
