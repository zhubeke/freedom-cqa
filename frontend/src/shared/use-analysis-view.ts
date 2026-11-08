import { ref, watch } from "vue";

export function useAnalysisView(storageKey: string) {
  let saved: string | null = null;
  try { saved = localStorage.getItem(storageKey); } catch { /* Preferences are optional. */ }
  const mode = ref<"simple" | "advanced">(saved === "advanced" ? "advanced" : "simple");
  watch(mode, (value) => {
    try { localStorage.setItem(storageKey, value); } catch { /* Keep the view usable without storage. */ }
  });
  return mode;
}
