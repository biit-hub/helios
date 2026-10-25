"use client";
import {
  createElement,
  useImperativeHandle,
  useSyncExternalStore,
  useState,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Icon } from "./icon";
import { HeliosSphereLoader } from "./helios-sphere-loader";

const classes = (...values: (string | undefined | false)[]) =>
  values.filter(Boolean).join(" ");
export type ButtonProps = ComponentProps<"button"> & {
  loading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "danger" | "icon";
};
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
export function Button({
  loading = false,
  loadingText = "Wird verarbeitet …",
  variant,
  className,
  disabled,
  children,
  ...props
}: Readonly<ButtonProps>) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  const actualVariant =
    variant ??
    (className?.split(/\s+/).includes("task-delete") ? "danger" : undefined);
  return (
    <>
      <button
        {...props}
        className={classes(
          "ui-button",
          actualVariant && "ui-button-" + actualVariant,
          variant === "secondary" && "secondary",
          className,
        )}
        disabled={!hydrated || disabled || loading}
        aria-busy={loading}
      >
        {loading && (
          <span className="ui-button-loader" aria-hidden="true">
            <HeliosSphereLoader size={24} color="#874411" ariaLabel="" />
          </span>
        )}
        <span className="ui-button-label">
          {loading ? loadingText : children}
        </span>
      </button>
      {loading && (
        <span className="ui-sr-only" aria-live="polite">
          {loadingText}
        </span>
      )}
    </>
  );
}
/** Bridges an existing shared busy flag without animating unrelated buttons. */
export function ActionButton({
  busy,
  disabled,
  onClickCapture,
  ref: suppliedRef,
  ...props
}: Readonly<Omit<ButtonProps, "loading"> & { busy: boolean }>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [triggered, setTriggered] = useState(false);
  useImperativeHandle(suppliedRef, () => ref.current!, []);
  useEffect(() => {
    if (busy) return;
    const timer = setTimeout(() => setTriggered(false), 0);
    return () => clearTimeout(timer);
  }, [busy, triggered]);
  useEffect(() => {
    const button = ref.current;
    const form = button?.form;
    if (!form) return;
    const submitted = (event: Event) => {
      const submitter = (event as SubmitEvent).submitter;
      const intended =
        submitter === button ||
        (!submitter &&
          form.querySelector('button[type="submit"],button:not([type])') ===
            button);
      if (intended && !busy && !disabled) setTriggered(true);
    };
    form.addEventListener("submit", submitted, true);
    return () => form.removeEventListener("submit", submitted, true);
  }, [busy, disabled, props.form]);
  return (
    <Button
      {...props}
      ref={ref}
      disabled={disabled || busy}
      loading={busy && triggered}
      onClickCapture={(event) => {
        if (!busy && !disabled) setTriggered(true);
        onClickCapture?.(event);
      }}
    />
  );
}
export function Input({
  className,
  ...props
}: Readonly<ComponentProps<"input">>) {
  return <input {...props} className={classes("ui-input", className)} />;
}
export function Textarea({
  className,
  ...props
}: Readonly<ComponentProps<"textarea">>) {
  return <textarea {...props} className={classes("ui-textarea", className)} />;
}
export function Select({
  className,
  ...props
}: Readonly<ComponentProps<"select">>) {
  return <select {...props} className={classes("ui-select", className)} />;
}
export function Checkbox({
  className,
  ...props
}: Readonly<ComponentProps<"input">>) {
  return (
    <input
      {...props}
      type="checkbox"
      className={classes("ui-checkbox", className)}
    />
  );
}
export function Switch({
  label,
  className,
  id: providedId,
  ...props
}: Readonly<
  Omit<ComponentProps<"input">, "type" | "role"> & { label: ReactNode }
>) {
  const id = useId();
  return (
    <label
      className={classes("ui-switch", className)}
      htmlFor={providedId ?? id}
    >
      <input {...props} id={providedId ?? id} type="checkbox" role="switch" />
      <span className="ui-switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
export function FormField({
  label,
  hint,
  children,
  className,
  ...props
}: Readonly<
  ComponentProps<"label"> & { label?: ReactNode; hint?: ReactNode }
>) {
  return (
    <label {...props} className={classes("ui-form-field", className)}>
      {label && <span>{label}</span>}
      {children}
      {hint && <small className="help">{hint}</small>}
    </label>
  );
}
export function Card({
  as: Tag = "section",
  className,
  ...props
}: Readonly<
  ComponentProps<"section"> & { as?: "section" | "article" | "aside" | "div" }
>) {
  return createElement(Tag, {
    ...props,
    className: classes("ui-card", className),
  });
}
export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted";
export function Badge({
  tone = "neutral",
  className,
  ...props
}: Readonly<ComponentProps<"span"> & { tone?: BadgeTone }>) {
  return (
    <span
      {...props}
      className={classes("badge ui-badge", "ui-badge-" + tone, className)}
    />
  );
}
export function StatusMessage({
  children,
  loading = false,
  error = false,
  className,
}: Readonly<{
  children: ReactNode;
  loading?: boolean;
  error?: boolean;
  className?: string;
}>) {
  return (
    <div
      className={classes("ui-status", error && "form-error", className)}
      role={error ? "alert" : "status"}
      aria-busy={loading}
    >
      {loading && (
        <span aria-hidden="true">
          <HeliosSphereLoader size={24} color="#874411" ariaLabel="" />
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}
export type AccordionProps = Omit<ComponentProps<"details">, "title"> & {
  title: ReactNode;
  bodyClassName?: string;
  onOpen?: () => void;
  onOpenStateChange?: (open: boolean) => void;
};
export function Accordion({
  title,
  children,
  className,
  onOpen,
  bodyClassName,
  onOpenStateChange,
  onToggle,
  ...props
}: Readonly<AccordionProps>) {
  return (
    <details
      {...props}
      className={classes("ui-accordion", className)}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        onToggle?.(event);
        onOpenStateChange?.(event.currentTarget.open);
        if (event.currentTarget.open) onOpen?.();
      }}
    >
      <summary>
        {title}
        <span className="ui-accordion-chevron" aria-hidden="true">
          <Icon name="chevron" />
        </span>
      </summary>
      <div className={classes("ui-accordion-body", bodyClassName)}>
        {children}
      </div>
    </details>
  );
}
export function DialogSurface({
  className,
  ...props
}: Readonly<ComponentProps<"section">>) {
  return (
    <section {...props} className={classes("ui-dialog-surface", className)} />
  );
}
export function Dialog({
  title,
  description,
  children,
  footer,
  close,
  busy = false,
  showCloseButton = true,
}: Readonly<{
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  close: () => void;
  busy?: boolean;
  showCloseButton?: boolean;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.showModal === "function") dialog.close();
      else dialog.removeAttribute("open");
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ui-dialog-surface ux-dialog card"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="panel-heading ui-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        {showCloseButton && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Schliessen
          </Button>
        )}
      </div>
      {description && <p id={descriptionId}>{description}</p>}
      <div className="ui-dialog-content">{children}</div>
      {footer && <div className="ui-dialog-actions">{footer}</div>}
    </dialog>
  );
}
