import type { StudioSection } from "./studioNav";

/**
 * Henüz ekranı olmayan bölümler menüde geçici olarak gizlenir (Görev 7–10 bunları tek tek açar).
 * Gizli bir bölüme işaret eden adres etkin rolün ana sayfasına gider.
 */
export const HIDDEN_SECTIONS: ReadonlySet<StudioSection> = new Set<StudioSection>(["publications", "people", "connections"]);
