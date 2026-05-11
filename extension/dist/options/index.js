// src/options/index.ts
var form = document.querySelector("form");
var input = document.querySelector("[name='backendUrl']");
async function init() {
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
