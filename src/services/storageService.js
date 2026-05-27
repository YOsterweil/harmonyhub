const STORAGE_KEY = 'harmonyhub.attempts.v1';
const MAX_ATTEMPTS = 20;
const STORAGE_KEY_STEP = 'harmonyhub.stepSummaries.v1';
const MAX_STEP_SUMMARIES = 50;

function safeParseAttempts(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    // Defensively recover to an empty history if stored JSON is corrupted.
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAttempts() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParseAttempts(raw);
}

export function saveAttempt(attempt) {
  const existing = getAttempts();
  const next = [attempt, ...existing].slice(0, MAX_ATTEMPTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return attempt;
}

export function getLatestAttempt() {
  const attempts = getAttempts();
  return attempts[0] ?? null;
}

export function listStepPracticeSummaries() {
  const raw = window.localStorage.getItem(STORAGE_KEY_STEP);
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStepPracticeSummary(summary) {
  if (!summary || typeof window === 'undefined') {
    return null;
  }

  const existing = listStepPracticeSummaries();
  const next = [summary, ...existing].slice(0, MAX_STEP_SUMMARIES);
  window.localStorage.setItem(STORAGE_KEY_STEP, JSON.stringify(next));
  return summary;
}
