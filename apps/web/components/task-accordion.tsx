"use client";
import { Accordion, type AccordionProps } from "@helios/ui";
export function TaskAccordion({
  className,
  title,
  ...props
}: Readonly<AccordionProps>) {
  return (
    <Accordion
      {...props}
      className={"task-accordion " + (className ?? "")}
      bodyClassName="task-accordion-body"
      title={<span>{title}</span>}
    />
  );
}
