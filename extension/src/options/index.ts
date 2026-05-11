const form = document.querySelector<HTMLFormElement>("form");
const input = document.querySelector<HTMLInputElement>("[name='backendUrl']");

async function init(): Promise<void> {
  const result = await chrome.storage.local.get("settings");
  if (input) {
    input.value = result.settings?.backendUrl ?? "http://localhost:8787";
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const backendUrl = input?.value.trim() || "http://localhost:8787";
  await chrome.storage.local.set({ settings: { backendUrl } });
});

void init();
