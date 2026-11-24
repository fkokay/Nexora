import { createContext } from 'react';

/** Tasarımcı tuvalinde true: ERP çizicisi her bileşenin önüne bir işaretçi (`<template data-cp-anchor>`) koyar. Normal sayfalarda false. */
export const CanvasAnchorContext = createContext(false);
