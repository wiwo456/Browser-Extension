function getRequiredElement<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

const TEMPORARY_BYPASS_KEY = "temporaryBypassState";
const USED_BYPASS_KEY = "usedBypassState";

const params = new URLSearchParams(window.location.search);
const originalUrl = params.get("url");
const domain = params.get("domain");
const reasonLabel = params.get("reasonLabel");
const reasonDescription = params.get("reasonDescription");
const reasonCode = params.get("reason");

const domainElement = getRequiredElement<HTMLElement>("[data-domain]");
const reasonLabelElement = getRequiredElement<HTMLElement>("[data-reason-label]");
const reasonCopyElement = getRequiredElement<HTMLElement>("[data-reason-copy]");
const visitRow = getRequiredElement<HTMLElement>("[data-visit-row]");
const visitButton = getRequiredElement<HTMLButtonElement>("[data-visit]");
const bypassMinutesSelect = getRequiredElement<HTMLSelectElement>("[data-bypass-minutes]");
const backButton = getRequiredElement<HTMLButtonElement>("[data-back]");
const hintElement = getRequiredElement<HTMLElement>("[data-hint]");

if (domainElement && domain) {
  domainElement.textContent = domain;
}

if (reasonLabelElement && reasonLabel) {
  reasonLabelElement.textContent = reasonLabel;
}

if (reasonCopyElement && reasonDescription) {
  reasonCopyElement.textContent = reasonDescription;
}

async function setupVisitAction(): Promise<void> {
  if (!visitButton || !visitRow || !hintElement) {
    return;
  }

  if (reasonCode === "study-mode") {
    visitRow.style.display = "none";
    hintElement.textContent = "Study mode does not allow bypass. This tab will close automatically in 5 seconds.";
    window.setTimeout(() => {
      window.close();
    }, 5000);
    return;
  }

  if (!originalUrl || !domain || !bypassMinutesSelect) {
    visitButton.disabled = true;
    return;
  }

  const result = await chrome.storage.local.get([TEMPORARY_BYPASS_KEY, USED_BYPASS_KEY]);
  const usedState = (result[USED_BYPASS_KEY] ?? {}) as Record<string, true>;

  if (usedState[domain]) {
    visitRow.style.display = "none";
    hintElement.textContent = "This website already used its one-time bypass. You can only close this tab now.";
    return;
  }

  visitButton.addEventListener("click", async () => {
    const minutes = Math.min(10, Math.max(1, Number(bypassMinutesSelect.value) || 5));
    const bypassState = (result[TEMPORARY_BYPASS_KEY] ?? {}) as Record<string, number>;
    bypassState[domain] = Date.now() + minutes * 60 * 1000;
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
