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
var countdownElement = getRequiredElement("[data-countdown]");
function setCountdown(secondsRemaining) {
  if (!countdownElement) {
    return;
  }
  countdownElement.style.display = "inline-flex";
  countdownElement.textContent = `Closing this tab in ${secondsRemaining} second${secondsRemaining === 1 ? "" : "s"}.`;
}
async function closeBlockedTab() {
  try {
    const currentTab = await chrome.tabs.getCurrent();
    if (typeof currentTab?.id === "number") {
      await chrome.tabs.remove(currentTab.id);
      return;
    }
  } catch {
  }
  window.close();
}
function startAutoCloseCountdown(seconds) {
  let remaining = seconds;
  setCountdown(remaining);
  const intervalId = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(intervalId);
      void closeBlockedTab();
      return;
    }
    setCountdown(remaining);
  }, 1e3);
}
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
    hintElement.textContent = "Study mode is active, so this page cannot use a temporary bypass.";
    startAutoCloseCountdown(5);
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
    await closeBlockedTab();
  });
}
