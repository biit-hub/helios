import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
afterEach(cleanup);

// jsdom has no Canvas renderer; dedicated lifecycle tests install a recording context.
beforeEach(() => {
  if (typeof HTMLCanvasElement !== "undefined")
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
