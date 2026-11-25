import { createContext } from 'react';

/** Tasarımcı tuvalinde true: ERP çizicisi her bileşenin önüne bir işaretçi (`<template data-cp-anchor>`) koyar. Normal sayfalarda false. */
export const CanvasAnchorContext = createContext(false);

/**
 * Tasarımcı tuvalinde Studio'nun `showTab` ile istediği etkin sekmeler (sekmeler bileşeni kimliği → sekme sırası). Yalnız
 * tuval sağlar; normal sayfalarda null ve `PageTabs` kendi durumunu kullanır.
 */
export const CanvasTabsContext = createContext<ReadonlyMap<string, number> | null>(null);
