// Where the links in sign-up and password-reset emails bring people back to
// (handled by src/app/auth/confirm/route.ts). Supabase only redirects to
// addresses on its allow list: Authentication → URL Configuration →
// Redirect URLs (see supabase/README.md).
export function emailLinkTarget(purpose: "signup" | "recovery") {
  return `${window.location.origin}/auth/confirm?purpose=${purpose}`;
}
