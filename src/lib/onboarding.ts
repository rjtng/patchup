// Remembers whether this browser has already seen onboarding.
// Storage can be unavailable (private mode, blocked cookies), so every access
// is wrapped and falls back to "not seen".
const KEY = "patchup:onboarding-seen";

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // ignore: onboarding will simply show again next time
  }
}
