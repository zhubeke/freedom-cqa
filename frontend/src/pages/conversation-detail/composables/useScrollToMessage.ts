import { onBeforeUnmount, ref, type Ref } from "vue";
import type { TranscriptEntry } from "../../../shared/types/conversation";

export function useScrollToMessage(panel: Ref<HTMLElement | null>, messages: () => TranscriptEntry[]) {
  const highlightedMessageId = ref<string | null>(null);
  let highlightTimer: number | undefined;

  function scrollToMessage(messageId: string): boolean {
    // Resolve against every source turn, including bot and system messages.
    const source = messages().find(message => message.message_id === messageId
      || (!messageId.includes(":") && message.message_id.split(":").at(-1) === messageId));
    const container = panel.value?.querySelector<HTMLElement>("[data-transcript-scroll]");
    if (!source || !container) return false;
    const target = [...container.querySelectorAll<HTMLElement>("[data-message-id]")]
      .find(element => element.dataset.messageId === source.message_id);
    if (!target) return false;

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (window.matchMedia("(min-width: 1024px)").matches) {
      // Desktop has independent panes; keep the rest of the workspace still.
      const top = container.scrollTop + target.getBoundingClientRect().top
        - container.getBoundingClientRect().top - (container.clientHeight - target.offsetHeight) / 2;
      container.scrollTo({ top: Math.max(0, top), behavior });
    } else {
      // On narrow screens the transcript is part of the page, above the results.
      target.scrollIntoView({ block: "center", behavior });
    }
    highlightedMessageId.value = source.message_id;
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => { highlightedMessageId.value = null; }, 2400);
    return true;
  }

  onBeforeUnmount(() => window.clearTimeout(highlightTimer));
  return { highlightedMessageId, scrollToMessage };
}
