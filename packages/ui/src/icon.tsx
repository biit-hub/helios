import type { ReactNode } from "react";
const paths = {
  focus: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  morning: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
  plan: (
    <>
      <path d="M8 5h13M8 12h13M8 19h13" />
      <path d="M3 5h.01M3 12h.01M3 19h.01" />
    </>
  ),
  tasks: (
    <>
      <path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
    </>
  ),
  epics: <path d="M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m9 3 1 3h4l1-3 3 2-1 3 2 3 3 1-1 4-3-1-3 2v4h-4l-1-3-4-1-2 2-2-3 2-3-1-3-3-1 2-3 3 1 3-2Z" />
    </>
  ),
  security: (
    <>
      <path d="m12 2 9 4v6c0 5-6 9-9 10-3-1-9-5-9-10V6l9-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
} satisfies Record<string, ReactNode>;
export function Icon({ name }: Readonly<{ name: keyof typeof paths }>) {
  return (
    <svg
      className="ui-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
