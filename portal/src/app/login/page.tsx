import LoginForm from "./LoginForm";

const ERROR_MESSAGES: Record<string, string> = {
  "missing-token": "The sign-in link is incomplete. Please request a new one.",
  "invalid-token": "This sign-in link has expired or is invalid. Please request a new one.",
  "no-access": "Your email isn't registered. Contact laurent@lpphospitality.com for access.",
  "session-expired": "Your session has expired. Please sign in again.",
};

export default function LoginPage() {
  return <LoginForm errorMessages={ERROR_MESSAGES} />;
}
