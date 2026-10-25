import { StrictMode, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  Accordion,
  ActionButton,
  Button,
  Checkbox,
  Dialog,
  HeliosSphereLoader,
  Switch,
} from "@helios/ui";

function canvasEnvironment(reduced = false) {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    globalAlpha: 0,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  const media = new EventTarget();
  let motion = reduced;
  Object.defineProperty(media, "matches", { get: () => motion });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  const frames = new Map<number, FrameRequestCallback>();
  let number = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      frames.set(++number, cb);
      return number;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.spyOn(performance, "now").mockReturnValue(0);
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  return {
    ctx,
    media,
    frames,
    frame: (now: number) => {
      const entry = [...frames][0]!;
      frames.delete(entry[0]);
      entry[1](now);
    },
    motion: (value: boolean) => {
      motion = value;
      media.dispatchEvent(new Event("change"));
    },
    hidden: (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("keeps the original 32 curves, 360 samples, transparent clearing and 5200 ms sphere-collapse cycle", () => {
  const env = canvasEnvironment();
  const view = render(<HeliosSphereLoader />);
  expect(env.ctx.stroke).toHaveBeenCalledTimes(32);
  expect(env.ctx.lineTo).toHaveBeenCalledTimes(32 * 359);
  expect(env.ctx.moveTo.mock.calls[0]![0]).toBeCloseTo(9.6);
  expect(env.ctx.moveTo.mock.calls[0]![1]).toBeCloseTo(60);
  expect(env.ctx.clearRect).toHaveBeenCalledWith(0, 0, 120, 120);
  expect(env.ctx.strokeStyle).toBe("#f4f7fb");
  expect(env.ctx.lineWidth).toBe(1.15);
  const original = env.ctx.lineTo.mock.calls.map((c) => c[1] as number);
  expect(Math.max(...original) - Math.min(...original)).toBeGreaterThan(80);
  env.ctx.lineTo.mockClear();
  env.frame(2600);
  const midpoints = Array.from(
    { length: 32 },
    (_, i) => env.ctx.lineTo.mock.calls[i * 359 + 179]![1],
  );
  expect(new Set(midpoints).size).toBe(1);
  expect(env.frames.size).toBe(1);
  view.unmount();
  expect(env.frames.size).toBe(0);
});
it("renders the static original sphere for reduced motion and switches between exactly one loop and no loop", () => {
  const env = canvasEnvironment(true);
  const view = render(<HeliosSphereLoader size={24} ariaLabel="Teststatus" />);
  expect(screen.getByRole("img", { name: "Teststatus" })).toHaveStyle({
    width: "24px",
    height: "24px",
  });
  expect(env.ctx.stroke).toHaveBeenCalledTimes(32);
  expect(env.frames.size).toBe(0);
  env.motion(false);
  expect(env.frames.size).toBe(1);
  env.motion(true);
  expect(env.frames.size).toBe(0);
  view.unmount();
  env.motion(false);
  expect(env.frames.size).toBe(0);
});
it("cancels hidden-page work, resumes one loop and cleans up on prop changes and StrictMode unmount", () => {
  const env = canvasEnvironment();
  const view = render(
    <StrictMode>
      <HeliosSphereLoader size={24} />
    </StrictMode>,
  );
  expect(env.frames.size).toBe(1);
  env.hidden(true);
  expect(env.frames.size).toBe(0);
  env.hidden(false);
  expect(env.frames.size).toBe(1);
  view.rerender(
    <StrictMode>
      <HeliosSphereLoader size={20} color="#874411" />
    </StrictMode>,
  );
  expect(env.frames.size).toBe(1);
  expect(env.ctx.strokeStyle).toBe("#874411");
  view.unmount();
  expect(env.frames.size).toBe(0);
  env.hidden(false);
  expect(env.frames.size).toBe(0);
});
it("keeps ordinary and disabled buttons free of animations, exposes a readable loading status and restores content", () => {
  const click = vi.fn();
  const view = render(
    <Button disabled onClick={click}>
      Speichern
    </Button>,
  );
  expect(view.container.querySelector("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(click).not.toHaveBeenCalled();
  view.rerender(
    <Button loading loadingText="Aufgabe wird gespeichert …" onClick={click}>
      Speichern
    </Button>,
  );
  expect(
    screen.getByRole("button", { name: "Aufgabe wird gespeichert …" }),
  ).toBeDisabled();
  expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Aufgabe wird gespeichert …",
  );
  expect(view.container.querySelectorAll("canvas")).toHaveLength(1);
  view.rerender(<Button onClick={click}>Speichern</Button>);
  expect(view.container.querySelector("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(click).toHaveBeenCalledOnce();
});
it.each(["success", "error", "unknown", "partial"])(
  "ends loading after %s and never animates unrelated disabled actions",
  async (result) => {
    let finish: (value: string) => void = () => {};
    const called = vi.fn();
    function Harness() {
      const [busy, setBusy] = useState(false);
      const [outcome, setOutcome] = useState("");
      const locked = ["unknown", "partial"].includes(outcome);
      async function send() {
        called();
        setBusy(true);
        const value = await new Promise<string>((resolve) => {
          finish = resolve;
        });
        setOutcome(value);
        setBusy(false);
      }
      return (
        <>
          <ActionButton
            busy={busy}
            disabled={locked}
            loadingText="Aufgabe wird erstellt …"
            onClick={() => void send()}
          >
            Erstellen
          </ActionButton>
          <Button disabled={busy}>Andere Aktion</Button>
          <output>{outcome}</output>
        </>
      );
    }
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Erstellen" }));
    const button = screen.getByRole("button", {
      name: "Aufgabe wird erstellt …",
    });
    fireEvent.click(button);
    expect(called).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Andere Aktion" }),
    ).not.toHaveAttribute("aria-busy", "true");
    await act(async () => finish(result));
    await waitFor(() =>
      expect(view.container.querySelector("canvas")).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Erstellen" })).toHaveProperty(
      "disabled",
      ["unknown", "partial"].includes(result),
    );
  },
);
it("tracks keyboard/native form submissions without changing submit behavior", async () => {
  let end: () => void = () => {};
  const send = vi.fn();
  function Form() {
    const [busy, setBusy] = useState(false);
    return (
      <form
        aria-label="Testformular"
        onSubmit={(e) => {
          e.preventDefault();
          send();
          setBusy(true);
          end = () => setBusy(false);
        }}
      >
        <ActionButton
          type="submit"
          busy={busy}
          loadingText="Einstellungen werden gespeichert …"
        >
          Speichern
        </ActionButton>
      </form>
    );
  }
  render(<Form />);
  fireEvent.submit(screen.getByRole("form", { name: "Testformular" }));
  expect(
    screen.getByRole("button", { name: "Einstellungen werden gespeichert …" }),
  ).toBeDisabled();
  expect(send).toHaveBeenCalledOnce();
  act(end);
  await screen.findByRole("button", { name: "Speichern" });
});
it("keeps switch and checkbox semantics distinct and preserves their bound values", () => {
  function Controls() {
    const [fun, setFun] = useState(false);
    return (
      <>
        <Switch
          label="Freiwillig / Spass"
          checked={fun}
          onChange={(e) => setFun(e.target.checked)}
        />
        <label>
          <Checkbox />
          Diese Änderung ausdrücklich bestätigen
        </label>
      </>
    );
  }
  render(<Controls />);
  const toggle = screen.getByRole("switch", { name: "Freiwillig / Spass" });
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(
    screen.getByRole("checkbox", {
      name: "Diese Änderung ausdrücklich bestätigen",
    }),
  ).not.toBeChecked();
});
it("uses the whole native summary and ignores bubbled nested toggle events", async () => {
  const opened = vi.fn();
  const view = render(
    <Accordion title="Nachweise" onOpen={opened}>
      <details>
        <summary>Unterabschnitt</summary>Text
      </details>
    </Accordion>,
  );
  const root = view.container.querySelector("details")!;
  root.open = true;
  fireEvent(root, new Event("toggle"));
  expect(opened).toHaveBeenCalledOnce();
  fireEvent(
    view.container.querySelector("details details")!,
    new Event("toggle", { bubbles: true }),
  );
  expect(opened).toHaveBeenCalledOnce();
  expect(root.querySelector(":scope > summary")).toHaveTextContent("Nachweise");
  expect(root.querySelector(":scope > summary button")).toBeNull();
});
it("shares modal naming, description, busy cancel protection and focus restoration", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn();
  const view = render(
    <Dialog
      title="Änderung bestätigen"
      description="Die Quelle bleibt geprüft."
      busy
      close={close}
    >
      Inhalt
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Änderung bestätigen" });
  expect(dialog).toHaveAccessibleDescription("Die Quelle bleibt geprüft.");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(close).not.toHaveBeenCalled();
  view.rerender(
    <Dialog title="Änderung bestätigen" close={close}>
      Inhalt
    </Dialog>,
  );
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
