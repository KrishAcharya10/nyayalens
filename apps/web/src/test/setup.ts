import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's automatic afterEach cleanup only self-registers
// when it detects vitest's globals mode; this project deliberately runs
// with globals: false (tests import describe/it/expect explicitly), so
// cleanup must be registered explicitly here - otherwise each test's
// rendered DOM accumulates across tests in the same file.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollIntoView - the document viewer's
// evidence-navigation code calls it, so every test needs a harmless stub.
if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement ResizeObserver - reactflow (GraphView) needs it
// to measure the canvas.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - test-only stub, not a full ResizeObserver implementation
  window.ResizeObserver = ResizeObserverStub;
}
