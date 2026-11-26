import { describe, expect, it, vi } from "vitest";
import type { PageCommands } from "../commands/types";
import { CSV_EXPORT_LABEL, SAVE_AND_NEW_COMMAND_ID, UNBOUND_REASON } from "../custom-page/pageActions";
import { orderShellActions, type ShellAction } from "./PageShell";
import { shellCommandActions, TEMPLATE_COMMAND_ORDER, templateBarProps } from "./templateCommands";

const on = () => ({ run: vi.fn() });
const unbound = { disabledReason: UNBOUND_REASON };
const page = (id: string, label: string, kind: ShellAction["kind"] = "normal"): ShellAction => ({ id, label, kind, run: vi.fn() });
const drawn = (actions: ShellAction[]) => { const { left, right } = orderShellActions(actions); return [...left, ...right].map((a) => a.label); };

describe("template commands", () => {
  it("TEMPLATE_COMMAND_ORDER is the fixed shell order", () => {
    expect([...TEMPLATE_COMMAND_ORDER]).toEqual(["new", "open", "view", SAVE_AND_NEW_COMMAND_ID, "refresh", "filter", "print", "export"]);
  });

  it("orders commands with primary left and Sil right", () => {
    const record: PageCommands = {
      shell: true, screen: "form",
      new: on(), save: { ...on(), primary: true }, delete: on(), refresh: on(), print: { hidden: true },
      barItems: [{ id: SAVE_AND_NEW_COMMAND_ID, label: "Kaydet ve yeni", shortcut: "Ctrl+F2", run: vi.fn() }],
    };
    const recordResult = shellCommandActions(record, [page("ekstre", "Ekstre al", "primary")]);
    expect(drawn(recordResult.actions)).toEqual(["Kaydet", "Yeni", "Kaydet ve yeni", "Yenile", "Ekstre al", "Sil"]);
    expect(recordResult.actions.map((a) => a.label)).toEqual(["Kaydet", "Yeni", "Kaydet ve yeni", "Yenile", "Ekstre al", "Sil"]);
    const kinds = Object.fromEntries(recordResult.actions.map((a) => [a.label, a.kind]));
    expect(kinds).toEqual({ Kaydet: "primary", Yeni: "normal", "Kaydet ve yeni": "normal", Yenile: "normal", "Ekstre al": "normal", Sil: "danger" });
    expect(recordResult.actions.find((a) => a.label === "Kaydet")?.shortcut).toBe("Ctrl+S");
    expect(recordResult.actions.find((a) => a.label === "Kaydet ve yeni")?.shortcut).toBe("Ctrl+F2");

    const list: PageCommands = {
      shell: true,
      delete: on(), export: on(), filter: on(), refresh: on(), view: on(), open: { ...on(), label: "Düzenle" }, new: { ...on(), primary: true },
      save: unbound, print: { hidden: true },
    };
    const listResult = shellCommandActions(list, []);
    expect(drawn(listResult.actions)).toEqual(["Yeni", "Düzenle", "Görüntüle", "Yenile", "Filtre", "Excel", "Sil"]);
    expect(listResult.actions[0].kind).toBe("primary");
  });

  it("unbound and hidden commands are not drawn; reasoned disabled ones are", () => {
    const { actions } = shellCommandActions({
      shell: true, new: { ...on(), primary: true }, open: { disabledReason: "Önce bir kayıt seçin" }, view: { hidden: true },
      refresh: on(), filter: unbound, print: { hidden: true }, export: unbound, delete: unbound,
    }, []);
    expect(actions.map((a) => a.label)).toEqual(["Yeni", "Düzenle", "Yenile"]);
    const edit = actions.find((a) => a.id === "open")!;
    expect(edit.disabled).toBe(true);
    expect(edit.disabledReason).toBe("Önce bir kayıt seçin");
    expect(edit.shortcut).toBe("Enter");
    const refresh = actions.find((a) => a.id === "refresh")!;
    refresh.run();
    expect(refresh.disabled).toBeFalsy();
  });

  it("runs the command's own run", () => {
    const save = vi.fn();
    const { actions } = shellCommandActions({ shell: true, save: { run: save, primary: true } }, []);
    actions[0].run();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("form screen drops list commands", () => {
    const { actions } = shellCommandActions({
      shell: true, screen: "form", new: on(), open: on(), view: on(), save: { ...on(), primary: true }, refresh: on(), filter: on(), print: on(), export: on(), delete: on(),
    }, []);
    expect(actions.map((a) => a.label)).toEqual(["Kaydet", "Yeni", "Yenile", "Yazdır", "Sil"]);
  });

  it("only Kaydet is the main button when it is offered", () => {
    const { actions } = shellCommandActions({ shell: true, new: { ...on(), primary: true }, save: { ...on(), primary: true } }, []);
    expect(actions.map((a) => [a.label, a.kind])).toEqual([["Kaydet", "primary"], ["Yeni", "normal"]]);
  });

  it("the ⋯ menu comes from more; moreHidden empties it", () => {
    const csv = vi.fn();
    const result = shellCommandActions({
      shell: true, refresh: on(),
      more: [{ id: "teklif", label: "Yeni teklif", run: vi.fn() }, { id: "pasif", label: "Pasife al", disabledReason: "Yetkiniz yok" }, { id: "csv", label: CSV_EXPORT_LABEL, run: csv }],
    }, []);
    expect(result.moreMenuHidden).toBe(false);
    expect(result.menu.map((item) => item.label)).toEqual(["Yeni teklif", "Pasife al", CSV_EXPORT_LABEL]);
    expect(result.menu[1].disabledReason).toBe("Yetkiniz yok");
    result.menu[2].run();
    expect(csv).toHaveBeenCalledTimes(1);
    const hidden = shellCommandActions({ shell: true, refresh: on(), moreHidden: true }, []);
    expect(hidden).toMatchObject({ menu: [], moreMenuHidden: true });
  });

  it("without shell commands the page buttons pass through unchanged", () => {
    const buttons = [page("kaydet", "Kaydet", "primary"), page("sil", "Sil", "danger")];
    expect(shellCommandActions(undefined, buttons)).toEqual({ actions: buttons, menu: [], moreMenuHidden: false });
    // Not a shell view: the shared ActionBar draws these commands, so the shell does not draw them again.
    expect(shellCommandActions({ refresh: on(), more: [{ id: "x", label: "X", run: vi.fn() }] }, buttons)).toEqual({ actions: buttons, menu: [], moreMenuHidden: false });
  });

  it("templateBarProps turns print on and keeps every other key", () => {
    const props = { slot: "commands", hiddenCommands: ["delete"], printEnabled: false, exportTable: "cariler" };
    expect(templateBarProps(props)).toEqual({ slot: "commands", hiddenCommands: ["delete"], printEnabled: true, exportTable: "cariler" });
    expect(props.printEnabled).toBe(false);
  });
});
