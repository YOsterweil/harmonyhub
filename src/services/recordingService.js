export async function recordPracticeAttempt({ durationMs = 3200 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
    return {
      mode: 'demo',
      reason: 'Microphone APIs are unavailable in this browser.'
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];

    const blob = await new Promise((resolve, reject) => {
      const recorder = new MediaRecorder(stream);

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      recorder.addEventListener('error', () => {
        reject(new Error('MediaRecorder error.'));
      });

      recorder.addEventListener('stop', () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      });

      recorder.start();
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, durationMs);
    });

    stream.getTracks().forEach((track) => track.stop());

    return {
      mode: 'microphone',
      audioBlob: blob,
      reason: 'Captured using browser microphone.'
    };
  } catch (error) {
    // Keep demo flow reliable for live presentations if mic permission is denied.
    return {
      mode: 'demo',
      reason: error?.message || 'Microphone permission denied.'
    };
  }
}
