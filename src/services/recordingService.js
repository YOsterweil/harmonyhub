import { analyzeMicrophoneSession } from './audioAnalysisService';

export async function recordPracticeAttempt(options = {}) {
  return analyzeMicrophoneSession(options);
}
