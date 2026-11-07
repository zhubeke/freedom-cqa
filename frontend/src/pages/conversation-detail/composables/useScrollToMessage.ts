import { onBeforeUnmount, ref } from "vue";

function shortMessageId(messageId: string): string {
  return messageId.includes(":") ? messageId.slice(messageId.lastIndexOf(":") + 1) : messageId;
}

export function useScrollToMessage() {
  const highlightedMessageId = ref<string | null>(null);
  let highlightTimer: number | undefined;

  function scrollToMessage(messageId: string): boolean {
    const requested = shortMessageId(messageId);
    const elements = document.querySelectorAll<HTMLElement>("[data-message-id]");
    const target = [...elements].find((element) => {
      const stableId = element.dataset.messageId ?? "";
      return stableId === messageId || shortMessageId(stableId) === requested;
    });
    if (!target) return false;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightedMessageId.value = target.dataset.messageId ?? messageId;
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => { highlightedMessageId.value = null; }, 2400);
    return true;
  }

  onBeforeUnmount(() => window.clearTimeout(highlightTimer));
  return { highlightedMessageId, scrollToMessage };
}
