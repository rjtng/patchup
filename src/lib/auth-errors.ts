// Supabase Auth error codes → what to tell the person.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_exists: "There's already an account with this email. Log in instead.",
  user_already_exists: "There's already an account with this email. Log in instead.",
  weak_password: "Choose a stronger password: mix letters, numbers and symbols.",
  same_password: "Choose a password different from your current one.",
  otp_expired: "That code is wrong or has expired. Check it, or send a new one.",
  over_email_send_rate_limit: "We've sent several emails to this address already. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  email_address_invalid: "Use a different email address.",
  validation_failed: "Check that your email address is correct.",
  signup_disabled: "Sign-ups are closed right now.",
  email_provider_disabled: "Sign-ups are closed right now.",
  user_banned: "This account has been suspended. Contact PatchUp support.",
  // Supabase's built-in email service only sends to the project's own team.
  email_address_not_authorized: "We can't send email to this address yet: PatchUp is still in testing.",
};

// Takes a Supabase AuthError, or just a code.
export function authErrorMessage(error: { code?: string; name?: string }) {
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.name === "AuthSessionMissingError") return "Your code has expired. Request a new one and try again.";
  if (error.name === "AuthRetryableFetchError") {
    return "Can't reach PatchUp right now. Check your internet connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
