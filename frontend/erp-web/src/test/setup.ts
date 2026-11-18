// Shared Vitest setup. Component tests can extend this (e.g. cleanup, matchMedia stubs).
import { configure } from '@testing-library/react';

// Whole-screen tests wait for their first data under parallel load (CI): the 1s default of waitFor / findBy is too
// tight for the first render of a large page. Waits that succeed still return as soon as they do.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no ResizeObserver; the advanced grid (also used by designer dataTable pages) measures its toolbar with
// one. Tests that need their own stub still replace it with vi.stubGlobal.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
