const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ML5_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/ml5@0.12.2/dist/ml5.min.js';
const CREPE_MODEL_URL = 'https://raw.githubusercontent.com/ml5js/ml5-data-and-models/main/models/pitch-detection/crepe/';

const SILENCE_RMS_THRESHOLD = 0.012;
const PITCH_RMS_THRESHOLD = 0.018;
const NOTE_GAP_MS = 220;
const PITCH_SAMPLE_INTERVAL_MS = 120;
const MIN_AUTOCORRELATION_CONFIDENCE = 0.2;

let ml5LoaderPromise = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundPercent(value) {
  return Math.round(clamp(value, 0, 100));
}

function calculateRms(buffer) {
  let sum = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index];
    sum += sample * sample;
  }

  return Math.sqrt(sum / buffer.length);
}

function autocorrelatePitch(buffer, sampleRate) {
  // Fallback pitch analysis: this is the browser-safe estimator when ml5 cannot be loaded.
  const size = buffer.length;
  const minFrequency = 65;
  const maxFrequency = 1200;
  const minLag = Math.floor(sampleRate / maxFrequency);
  const maxLag = Math.floor(sampleRate / minFrequency);
  const rms = calculateRms(buffer);

  if (rms < PITCH_RMS_THRESHOLD) {
    return null;
  }

  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let divisor = 0;

    for (let index = 0; index < size - lag; index += 1) {
      const current = buffer[index];
      const shifted = buffer[index + lag];
      sum += current * shifted;
      divisor += current * current + shifted * shifted;
    }

    const correlation = divisor ? (2 * sum) / divisor : 0;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation < MIN_AUTOCORRELATION_CONFIDENCE) {
    return null;
  }

  return {
    frequency: sampleRate / bestLag,
    confidence: clamp(bestCorrelation, 0, 1),
    source: 'fallback'
  };
}

function frequencyToMidi(frequency) {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function frequencyToNoteName(frequency) {
  if (!frequency || frequency <= 0) {
    return null;
  }

  const midi = frequencyToMidi(frequency);
  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

export function pitchClass(noteName) {
  return noteName ? noteName.replace(/-?\d+/g, '') : null;
}

function centsDifference(leftFrequency, rightFrequency) {
  if (!leftFrequency || !rightFrequency) {
    return Infinity;
  }

  return Math.abs(1200 * Math.log2(leftFrequency / rightFrequency));
}

function createNoteEvent(sample, timestampMs) {
  return {
    noteName: sample.noteName,
    pitchClass: sample.pitchClass,
    startMs: timestampMs,
    lastSeenMs: timestampMs,
    frames: 1,
    frequencyTotal: sample.frequency,
    confidenceTotal: sample.confidence,
    rmsTotal: sample.rms,
    source: sample.source
  };
}

function updateNoteEvent(event, sample, timestampMs) {
  event.lastSeenMs = timestampMs;
  event.frames += 1;
  event.frequencyTotal += sample.frequency;
  event.confidenceTotal += sample.confidence;
  event.rmsTotal += sample.rms;
}

function finalizeNoteEvent(event) {
  if (!event || event.frames < 2) {
    return null;
  }

  const averageFrequency = event.frequencyTotal / event.frames;
  const averageConfidence = event.confidenceTotal / event.frames;
  const averageRms = event.rmsTotal / event.frames;
  const noteName = frequencyToNoteName(averageFrequency);

  return {
    noteName,
    pitchClass: pitchClass(noteName),
    startMs: event.startMs,
    endMs: event.lastSeenMs,
    durationMs: event.lastSeenMs - event.startMs,
    frequency: averageFrequency,
    confidence: averageConfidence,
    averageRms,
    frames: event.frames,
    source: event.source
  };
}

function previewNoteEvent(event) {
  return {
    noteName: event.pitchClass,
    pitchClass: event.pitchClass,
    startMs: event.startMs,
    endMs: event.lastSeenMs,
    durationMs: Math.max(0, event.lastSeenMs - event.startMs),
    frequency: event.frequencyTotal / event.frames,
    confidence: event.confidenceTotal / event.frames,
    averageRms: event.rmsTotal / event.frames,
    frames: event.frames,
    source: event.source
  };
}

function confidenceLabelFromSamples(stablePitchSamples, usablePitchSamples) {
  if (stablePitchSamples >= 12 || usablePitchSamples >= 18) {
    return 'High confidence';
  }

  if (stablePitchSamples >= 5 || usablePitchSamples >= 8) {
    return 'Medium confidence';
  }

  return 'Low confidence';
}

async function loadMl5Library() {
  if (typeof window.ml5 !== 'undefined') {
    return window.ml5;
  }

  if (!ml5LoaderPromise) {
    ml5LoaderPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-harmonyhub-ml5="true"]');
      if (existingScript && typeof window.ml5 !== 'undefined') {
        resolve(window.ml5);
        return;
      }

      const script = document.createElement('script');
      script.src = ML5_SCRIPT_URL;
      script.async = true;
      script.dataset.harmonyhubMl5 = 'true';
      script.onload = () => resolve(window.ml5);
      script.onerror = () => reject(new Error('Failed to load ml5.js.'));
      document.head.appendChild(script);
    });
  }

  return ml5LoaderPromise;
}

async function createMl5PitchDetector(audioContext, stream) {
  try {
    const ml5 = await loadMl5Library();

    if (!ml5?.pitchDetection) {
      return { detector: null, source: 'fallback' };
    }

    const detector = await new Promise((resolve, reject) => {
      let createdDetector;

      try {
        createdDetector = ml5.pitchDetection(CREPE_MODEL_URL, audioContext, stream, () => {
          resolve(createdDetector);
        });
      } catch (error) {
        reject(error);
      }
    });

    return { detector, source: 'ml5' };
  } catch {
    return { detector: null, source: 'fallback' };
  }
}

function readMl5Frequency(detector) {
  return new Promise((resolve) => {
    if (!detector?.getPitch) {
      resolve(null);
      return;
    }

    try {
      detector.getPitch((error, pitch) => {
        if (error) {
          resolve(null);
          return;
        }

        if (typeof pitch === 'number') {
          resolve(pitch);
          return;
        }

        if (pitch && typeof pitch === 'object') {
          resolve(pitch.frequency ?? pitch.freq ?? pitch.pitch ?? null);
          return;
        }

        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function startAudioAnalysisSession({ durationMs = 120000, onUpdate } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === 'undefined') {
    throw new Error('Microphone analysis is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor();
  await audioContext.resume();

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.15;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const ml5Pitch = await createMl5PitchDetector(audioContext, stream);
  const noteEvents = [];
  let activeNoteEvent = null;
  let totalVolume = 0;
  let volumeSamples = 0;
  let maxVolume = 0;
  let liveVolume = 0;
  let livePitchFrequency = null;
  let livePitchNoteName = null;
  let livePitchConfidence = 0;
  let lastDetectedPitchClass = null;
  let audioDetected = false;
  let usablePitchSamples = 0;
  let stablePitchSamples = 0;
  let lastPitchSampleMs = 0;
  let pitchRequestPending = false;
  let stopped = false;
  let requestAnimationId = null;
  let timeoutId = null;
  const startedAt = performance.now();

  function buildSummary(extra = {}) {
    const averageVolume = volumeSamples > 0 ? totalVolume / volumeSamples : 0;
    const finalizedEvents = [...noteEvents];

    if (activeNoteEvent) {
      const preview = previewNoteEvent(activeNoteEvent);
      finalizedEvents.push(preview);
    }

    const detectedNotes = finalizedEvents.map((event) => event.pitchClass).filter(Boolean);

    return {
      captureMode: ml5Pitch.source,
      pitchSource: ml5Pitch.source,
      audioDetected: audioDetected || averageVolume >= SILENCE_RMS_THRESHOLD || finalizedEvents.length > 0,
      noAudioDetected: averageVolume < SILENCE_RMS_THRESHOLD || finalizedEvents.length === 0,
      averageVolume,
      maxVolume,
      durationMs: performance.now() - startedAt,
      detectedNotes,
      noteEvents: finalizedEvents,
      noteSegments: finalizedEvents,
      livePitchFrequency,
      livePitchNoteName,
      livePitchConfidence,
      pitchConfidenceLabel: confidenceLabelFromSamples(stablePitchSamples, usablePitchSamples),
      pitchSampleCount: usablePitchSamples,
      stablePitchSampleCount: stablePitchSamples,
      reason:
        averageVolume < SILENCE_RMS_THRESHOLD || finalizedEvents.length === 0
          ? 'No clear audio detected.'
          : ml5Pitch.source === 'ml5'
            ? 'Microphone analyzed with ml5 CREPE pitch detection.'
            : 'Microphone analyzed with browser fallback pitch detection.',
      ...extra
    };
  }

  function emitUpdate() {
    onUpdate?.(
      buildSummary({
        elapsedMs: performance.now() - startedAt,
        liveVolume,
        livePitchFrequency,
        livePitchNoteName,
        livePitchConfidence,
        activeNoteEvent: activeNoteEvent ? previewNoteEvent(activeNoteEvent) : null
      })
    );
  }

  function finalizeActiveEvent(timestampMs) {
    if (!activeNoteEvent) {
      return;
    }

    activeNoteEvent.lastSeenMs = timestampMs;
    const finalized = finalizeNoteEvent(activeNoteEvent);

    if (finalized) {
      noteEvents.push(finalized);
    }

    activeNoteEvent = null;
  }

  async function samplePitch(timestampMs, bufferSnapshot) {
    if (pitchRequestPending || stopped) {
      return;
    }

    pitchRequestPending = true;

    try {
      let frequency = null;
      let source = ml5Pitch.source;

      if (ml5Pitch.detector) {
        frequency = await readMl5Frequency(ml5Pitch.detector);
      }

      if (!frequency) {
        const fallbackSample = autocorrelatePitch(bufferSnapshot, audioContext.sampleRate);
        frequency = fallbackSample?.frequency ?? null;
        source = fallbackSample ? 'fallback' : source;
        livePitchConfidence = fallbackSample?.confidence ?? 0;
      } else {
        livePitchConfidence = 0.85;
      }

      if (!frequency) {
        lastDetectedPitchClass = null;
        return;
      }

      usablePitchSamples += 1;
      livePitchFrequency = frequency;
      livePitchNoteName = frequencyToNoteName(frequency);
      const pitchClassName = pitchClass(livePitchNoteName);
      const noteConfidence = livePitchConfidence;

      if (pitchClassName) {
        audioDetected = true;

        const pitchSample = {
          frequency,
          noteName: livePitchNoteName,
          pitchClass: pitchClassName,
          confidence: noteConfidence,
          rms: liveVolume,
          source
        };

        if (!activeNoteEvent) {
          activeNoteEvent = createNoteEvent(pitchSample, timestampMs);
          stablePitchSamples += 1;
        } else if (
          activeNoteEvent.pitchClass === pitchClassName &&
          timestampMs - activeNoteEvent.lastSeenMs <= NOTE_GAP_MS &&
          centsDifference(activeNoteEvent.frequencyTotal / activeNoteEvent.frames, frequency) <= 35
        ) {
          updateNoteEvent(activeNoteEvent, pitchSample, timestampMs);
          stablePitchSamples += 1;
        } else {
          finalizeActiveEvent(timestampMs);
          activeNoteEvent = createNoteEvent(pitchSample, timestampMs);
          stablePitchSamples += 1;
        }

        lastDetectedPitchClass = pitchClassName;
      }
    } finally {
      pitchRequestPending = false;
      emitUpdate();
    }
  }

  function cleanup() {
    if (requestAnimationId !== null) {
      cancelAnimationFrame(requestAnimationId);
      requestAnimationId = null;
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    stream.getTracks().forEach((track) => track.stop());

    if (audioContext.state !== 'closed') {
      audioContext.close();
    }
  }

  let resolveResult;
  const resultPromise = new Promise((resolve) => {
    resolveResult = resolve;
  });

  const stop = async (reason = 'stopped') => {
    if (stopped) {
      return resultPromise;
    }

    stopped = true;
    finalizeActiveEvent(performance.now() - startedAt);
    cleanup();

    resolveResult(
      buildSummary({
        reason,
        stopReason: reason
      })
    );

    return resultPromise;
  };

  const frame = () => {
    if (stopped) {
      return;
    }

    const elapsedMs = performance.now() - startedAt;

    analyser.getFloatTimeDomainData(buffer);
    liveVolume = calculateRms(buffer);
    totalVolume += liveVolume;
    volumeSamples += 1;
    maxVolume = Math.max(maxVolume, liveVolume);

    if (liveVolume >= SILENCE_RMS_THRESHOLD) {
      audioDetected = true;
    }

    if (elapsedMs - lastPitchSampleMs >= PITCH_SAMPLE_INTERVAL_MS && !pitchRequestPending) {
      lastPitchSampleMs = elapsedMs;
      const bufferSnapshot = new Float32Array(buffer);
      samplePitch(elapsedMs, bufferSnapshot).catch(() => {
        pitchRequestPending = false;
      });
    }

    if (activeNoteEvent && elapsedMs - activeNoteEvent.lastSeenMs > NOTE_GAP_MS && !pitchRequestPending) {
      finalizeActiveEvent(elapsedMs);
    }

    emitUpdate();

    if (elapsedMs >= durationMs) {
      stop('timeout').catch(() => {});
      return;
    }

    requestAnimationId = requestAnimationFrame(frame);
  };

  timeoutId = window.setTimeout(() => {
    if (!stopped) {
      stop('timeout').catch(() => {});
    }
  }, durationMs);

  requestAnimationId = requestAnimationFrame(frame);

  return {
    stop,
    resultPromise,
    pitchSource: ml5Pitch.source,
    supportsMl5: ml5Pitch.source === 'ml5'
  };
}