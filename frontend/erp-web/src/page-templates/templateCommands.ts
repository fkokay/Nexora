import { COMMAND_LABELS } from "../action-bar/labels";
import { STANDARD_SHORTCUTS } from "../commands/shortcuts";
import { offersCommand, type CommandSpec, type MenuCommand, type PageCommands, type StandardCommandId } from "../commands/types";
import { SAVE_AND_NEW_COMMAND_ID, UNBOUND_REASON } from "../custom-page/pageActions";
import type { ShellAction, ShellMenuItem } from "./PageShell";

/**
 * Kalıp kabuğundaki komutların sabit sırası (Taslak 11): ana düğme (Kaydet bağlıysa Kaydet, yoksa Yeni) en solda, ardından bu
 * sıra, sonra sayfanın `actions` düğmeleri, Sil en sağda. Danışman sıralayamaz. Kaydet sırada yoktur: varsa ana düğmedir.
 */
export const TEMPLATE_COMMAND_ORDER = ["new", "open", "view", SAVE_AND_NEW_COMMAND_ID, "refresh", "filter", "print", "export"] as const;

/** Eski çubukla aynı: kaynağın kaydettiği ama çalıştıramadığı komut nedeni verilmeden pasiftir. */
const UNAVAILABLE = "Bu ekranda kullanılamaz";

const stateOf = (spec: Pick<CommandSpec, "run" | "disabledReason">) =>
  spec.run && !spec.disabledReason ? { enabled: true as const } : { enabled: false as const, reason: spec.disabledReason ?? UNAVAILABLE };

function commandAction(id: StandardCommandId, spec: CommandSpec, kind: ShellAction["kind"]): ShellAction {
  const { enabled, reason } = stateOf(spec);
  return {
    id, label: spec.label || COMMAND_LABELS[id], kind, shortcut: STANDARD_SHORTCUTS[id],
    ...(enabled ? {} : { disabled: true, disabledReason: reason }),
    run: () => { if (enabled) void spec.run?.(); },
  };
}

function itemAction(item: MenuCommand): ShellAction {
  const { enabled, reason } = stateOf(item);
  return {
    id: item.id, label: item.label, kind: "normal", ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    ...(enabled ? {} : { disabled: true, disabledReason: reason }),
    run: () => { if (enabled) void item.run?.(); },
  };
}

function menuItem(item: MenuCommand): ShellMenuItem {
  const { enabled, reason } = stateOf(item);
  return {
    id: item.id, label: item.label, ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    ...(enabled ? {} : { disabledReason: reason }),
    run: () => { if (enabled) void item.run?.(); },
  };
}

/** Kabuğun çizdiği bir komut: kaynak kaydetmiş, gizli değil, ekran sunuyor ve bu sayfada bağlı. */
const drawable = (commands: PageCommands, id: StandardCommandId) => offersCommand(commands, id) && commands[id]!.disabledReason !== UNBOUND_REASON;

/**
 * Kayıt defterinin bu görünüm için birleştirdiği komutlar → kabuğun düğmeleri ve "⋯" menüsünün `Diğer` kısmı. Görünüm kabuk
 * görünümü değilse (`shell` yok) komutları ortak çubuk çizer; sayfa düğmeleri olduğu gibi döner. Bağlanmamış ve gizli komut
 * çizilmez; nedenli pasif komut çizilir. Komut varken sayfa düğmelerinin `primary`'si `normal` olur (ana düğme komutundur).
 */
export function shellCommandActions(commands: PageCommands | undefined, pageButtons: ShellAction[]): { actions: ShellAction[]; menu: ShellMenuItem[]; moreMenuHidden: boolean } {
  if (!commands?.shell) return { actions: pageButtons, menu: [], moreMenuHidden: false };
  const saveShown = drawable(commands, "save");
  const actions: ShellAction[] = [];
  if (saveShown) actions.push(commandAction("save", commands.save!, "primary"));
  const barItems = commands.barItems ?? [];
  for (const id of TEMPLATE_COMMAND_ORDER) {
    if (id === SAVE_AND_NEW_COMMAND_ID) {
      const item = barItems.find((candidate) => candidate.id === SAVE_AND_NEW_COMMAND_ID);
      if (item && item.disabledReason !== UNBOUND_REASON) actions.push(itemAction(item));
      continue;
    }
    if (!drawable(commands, id)) continue;
    const spec = commands[id]!;
    actions.push(commandAction(id, spec, !saveShown && spec.primary ? "primary" : "normal"));
  }
  actions.push(...pageButtons.map((button) => (button.kind === "primary" ? { ...button, kind: "normal" as const } : button)));
  if (drawable(commands, "delete")) actions.push(commandAction("delete", commands.delete!, "danger"));
  const moreMenuHidden = !!commands.moreHidden;
  return { actions, menu: moreMenuHidden ? [] : (commands.more ?? []).map(menuItem), moreMenuHidden };
}

/** Kalıplı sayfanın komut çubuğu ayarları: görünen Yazdır yazdırır (eski `printEnabled: true`), diğer her ayar aynen kalır. */
export function templateBarProps(props: Record<string, unknown>): Record<string, unknown> {
  return { ...props, printEnabled: true };
}
