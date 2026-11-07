import { computed, ref } from "vue";
import { defineStore } from "pinia";

export interface HistoryAction {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  mergeKey?: string;
}

interface HistoryEntry extends HistoryAction { createdAt: number }
export interface AppNotice { id: number; message: string; tone: "success" | "error" }

export const useHistoryStore = defineStore("history", () => {
  const undoStack = ref<HistoryEntry[]>([]);
  const redoStack = ref<HistoryEntry[]>([]);
  const busy = ref(false);
  const applying = ref(false);
  const notices = ref<AppNotice[]>([]);
  let noticeId = 0;

  const canUndo = computed(() => undoStack.value.length > 0 && !busy.value);
  const canRedo = computed(() => redoStack.value.length > 0 && !busy.value);

  function notify(message: string, tone: AppNotice["tone"] = "success") {
    const id = ++noticeId;
    notices.value.push({ id, message, tone });
    window.setTimeout(() => dismissNotice(id), 3500);
  }
  function dismissNotice(id: number) { notices.value = notices.value.filter((notice) => notice.id !== id); }

  function record(action: HistoryAction): void {
    if (applying.value || busy.value) return;
    const now = Date.now();
    const previous = undoStack.value.at(-1);
    if (action.mergeKey && previous?.mergeKey === action.mergeKey && now - previous.createdAt < 750) {
      previous.redo = action.redo;
      previous.label = action.label;
      previous.createdAt = now;
    } else {
      undoStack.value.push({ ...action, createdAt: now });
      if (undoStack.value.length > 100) undoStack.value.shift();
    }
    redoStack.value = [];
  }

  async function apply(direction: "undo" | "redo") {
    const source = direction === "undo" ? undoStack.value : redoStack.value;
    const target = direction === "undo" ? redoStack.value : undoStack.value;
    const entry = source.at(-1);
    if (!entry || busy.value) return false;
    busy.value = true;
    applying.value = true;
    try {
      await (direction === "undo" ? entry.undo() : entry.redo());
      source.pop();
      target.push(entry);
      notify(`${direction === "undo" ? "Undid" : "Redid"} ${entry.label}`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : `Could not ${direction} ${entry.label}`, "error");
      return false;
    } finally {
      applying.value = false;
      busy.value = false;
    }
  }

  const undo = () => apply("undo");
  const redo = () => apply("redo");
  const clear = () => { undoStack.value = []; redoStack.value = []; };
  return { undoStack, redoStack, busy, applying, notices, canUndo, canRedo, record, undo, redo, clear, notify, dismissNotice };
});

export function isNativeUndoTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || Boolean(target.closest("[contenteditable='true']"));
}
