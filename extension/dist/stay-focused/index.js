// src/stay-focused/index.ts
function getRequiredElement(selector) {
  return document.querySelector(selector);
}
var TEMPORARY_BYPASS_KEY = "temporaryBypassState";
var USED_BYPASS_KEY = "usedBypassState";
var params = new URLSearchParams(window.location.search);
var originalUrl = params.get("url");
var domain = params.get("domain");
var reasonLabel = params.get("reasonLabel");
var reasonDescription = params.get("reasonDescription");
var reasonCode = params.get("reason");
var domainElement = getRequiredElement("[data-domain]");
var reasonLabelElement = getRequiredElement("[data-reason-label]");
var reasonCopyElement = getRequiredElement("[data-reason-copy]");
var visitRow = getRequiredElement("[data-visit-row]");
var visitButton = getRequiredElement("[data-visit]");
var bypassMinutesSelect = getRequiredElement("[data-bypass-minutes]");
var backButton = getRequiredElement("[data-back]");
var hintElement = getRequiredElement("[data-hint]");
if (domainElement && domain) {
  domainElement.textContent = domain;
}
if (reasonLabelElement && reasonLabel) {
  reasonLabelElement.textContent = reasonLabel;
}
if (reasonCopyElement && reasonDescription) {
  reasonCopyElement.textContent = reasonDescription;
}
async function setupVisitAction() {
  if (!visitButton || !visitRow || !hintElement) {
    return;
  }
  if (reasonCode === "study-mode") {
    visitRow.style.display = "none";
    hintElement.textContent = "Study mode does not allow bypass. This tab will close automatically in 5 seconds.";
    window.setTimeout(() => {
      window.close();
    }, 5e3);
    return;
  }
  if (!originalUrl || !domain || !bypassMinutesSelect) {
    visitButton.disabled = true;
    return;
  }
  const result = await chrome.storage.local.get([TEMPORARY_BYPASS_KEY, USED_BYPASS_KEY]);
  const usedState = result[USED_BYPASS_KEY] ?? {};
  if (usedState[domain]) {
    visitRow.style.display = "none";
    hintElement.textContent = "This website already used its one-time bypass. You can only close this tab now.";
    return;
  }
  visitButton.addEventListener("click", async () => {
    const minutes = Math.min(10, Math.max(1, Number(bypassMinutesSelect.value) || 5));
    const bypassState = result[TEMPORARY_BYPASS_KEY] ?? {};
    bypassState[domain] = Date.now() + minutes * 60 * 1e3;
    usedState[domain] = true;
    await chrome.storage.local.set({
      [TEMPORARY_BYPASS_KEY]: bypassState,
      [USED_BYPASS_KEY]: usedState
    });
    window.location.href = originalUrl;
  });
}
void setupVisitAction();
if (backButton) {
  backButton.addEventListener("click", async () => {
    window.close();
  });
}
