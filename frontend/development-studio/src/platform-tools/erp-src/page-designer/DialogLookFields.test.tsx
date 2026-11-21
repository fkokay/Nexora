import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DialogLookFields } from "./DialogLookFields";

type ButtonProps = { children: ReactNode; onClick: () => void; "aria-pressed": boolean };
/** DialogLookFields has no hooks: call it and collect its buttons to drive their onClick. */
const buttonsOf = (props: Record<string, unknown>, onPatch: (patch: Record<string, unknown>) => void) => {
  const found: ButtonProps[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!isValidElement(node)) return;
    const element = node as ReactElement<{ children?: ReactNode } & Partial<ButtonProps>>;
    if (element.type === "button") found.push(element.props as ButtonProps);
    walk(element.props.children);
  };
  walk(DialogLookFields({ props, onPatch }));
  return (label: string) => found.find((button) => button.children === label)!;
};

describe("DialogLookFields", () => {
  it("varsayılanlar Orta ve Kapanmasın seçili görünür", () => {
    const html = renderToString(<DialogLookFields props={{}} onPatch={() => undefined} />);
    expect(html).toContain("Boyut");
    expect(html).toContain("Dışarı tıklayınca");
    const button = buttonsOf({}, () => undefined);
    expect(button("Orta")["aria-pressed"]).toBe(true);
    expect(button("Kapanmasın")["aria-pressed"]).toBe(true);
    expect(button("Tam ekran")["aria-pressed"]).toBe(false);
  });

  it("varsayılan değer undefined yazar", () => {
    const patches: Record<string, unknown>[] = [];
    const button = buttonsOf({ size: "lg", backdropClose: true }, (patch) => patches.push(patch));
    expect(button("Büyük")["aria-pressed"]).toBe(true);
    expect(button("Kapansın")["aria-pressed"]).toBe(true);
    button("Orta").onClick();
    button("Kapanmasın").onClick();
    button("Küçük").onClick();
    button("Tam ekran").onClick();
    button("Kapansın").onClick();
    expect(patches).toEqual([{ size: undefined }, { backdropClose: undefined }, { size: "sm" }, { size: "full" }, { backdropClose: true }]);
  });

  it("bilinmeyen boyut Orta sayılır", () => {
    expect(buttonsOf({ size: "xxl" }, () => undefined)("Orta")["aria-pressed"]).toBe(true);
  });
});
