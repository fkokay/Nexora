import { createContext } from 'react';

/** Tasarımcı tuvalinde true: ERP çizicisi her bileşenin önüne bir işaretçi (`<template data-cp-anchor>`) koyar. Normal sayfalarda false. */
export const CanvasAnchorContext = createContext(false);

/** Studio'nun son `showTab` isteği: sekme sırası ve her istekte artan sayaç (aynı sekme yeniden istenebilsin). */
export type CanvasTabRequest = { index: number; signal: number };

/**
 * Tasarımcı tuvalinde Studio'nun `showTab` ile istediği sekmeler (sekmeler bileşeni kimliği → son istek). Yalnız tuval
 * sağlar; normal sayfalarda null. `PageTabs` isteği bir olay gibi uygular: etkin sekmesini değiştirir, kullanıcının kendi
 * tıklaması yine sekmeyi değiştirir; yeniden takılan (reload) sekmeler son istekle açılır.
 */
export const CanvasTabsContext = createContext<ReadonlyMap<string, CanvasTabRequest> | null>(null);
