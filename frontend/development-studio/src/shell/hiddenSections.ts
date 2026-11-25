import type { StudioSection } from "./studioNav";

/**
 * Henüz ekranı olmayan bölümler menüde geçici olarak gizlenir (sonraki görevler bunları tek tek açar).
 * Gizli bir bölüme işaret eden adres etkin rolün ana sayfasına gider.
 */
export const HIDDEN_SECTIONS: ReadonlySet<StudioSection> = new Set<StudioSection>(["people", "connections"]);
