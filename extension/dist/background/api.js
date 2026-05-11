export async function sendActivity(activity) {
    try {
        const result = await chrome.storage.local.get("settings");
        const backendUrl = result.settings?.backendUrl ?? "http://localhost:8787";
        await fetch(`${backendUrl}/track`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ activity })
        });
    }
    catch (error) {
        console.warn("Failed to send activity to backend", error);
    }
}
