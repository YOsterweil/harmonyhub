const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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

function autoCorrelate(buffer, sampleRate) {
  // Real analysis: this estimates the dominant pitch from microphone samples using autocorrelation.
  const size = buffer.length;
  const minFrequency = 65;
  const maxFrequency = 1200;
  const minLag = Math.floor(sampleRate / maxFrequency);
  const maxLag = Math.floor(sampleRate / minFrequency);

  const rms = calculateRms(buffer);
  if (rms < 0.01) {
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

  if (bestLag <= 0 || bestCorrelation < 0.2) {
    return null;
  }

  return {
    frequency: sampleRate / bestLag,
    confidence: clamp(bestCorrelation, 0, 1),
    rms
  };
}

export function frequencyToNoteName(frequency) {
  if (!frequency || frequency <= 0) {
    return null;
  }

  const midiNote = Math.round(69 + 12 * Math.log2(frequency / 440));
  const noteName = NOTE_NAMES[((midiNote % 12) + 12) % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
}

export function pitchClass(noteName) {
  return noteName ? noteName.replace(/-?\d+/g, '') : null;
}

function createSegment(sample, elapsedMs) {
  return {
    noteName: sample.noteName,
    pitchClass: sample.pitchClass,
    startMs: elapsedMs,
    lastSeenMs: elapsedMs,
    frames: 1,
    frequencyTotal: sample.frequency,
    confidenceTotal: sample.confidence,
    rmsTotal: sample.rms
  };
}

function updateSegment(segment, sample, elapsedMs) {
  segment.lastSeenMs = elapsedMs;
  segment.frames += 1;
  segment.frequencyTotal += sample.frequency;
  segment.confidenceTotal += sample.confidence;
  segment.rmsTotal += sample.rms;
}

function finalizeSegment(segment) {
  if (!segment || segment.frames < 2) {
    return null;
  }

  const averageFrequency = segment.frequencyTotal / segment.frames;
  const averageConfidence = segment.confidenceTotal / segment.frames;
  const averageRms = segment.rmsTotal / segment.frames;
  const noteName = frequencyToNoteName(averageFrequency);

  return {
    noteName,
    pitchClass: pitchClass(noteName),
    startMs: segment.startMs,
    durationMs: segment.lastSeenMs - segment.startMs,
    endMs: segment.lastSeenMs,
    frequency: averageFrequency,
    confidence: averageConfidence,
    averageRms,
    frames: segment.frames
  };
}

export async function analyzeMicrophoneSession({ durationMs = 5000, onUpdate } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === 'undefined') {
    return {
      captureMode: 'unavailable',
      noAudioDetected: true,
      audioDetected: false,
      reason: 'Microphone analysis is not supported in this browser.',
      averageVolume: 0,
      maxVolume: 0,
      detectedNotes: [],
      noteSegments: [],
      durationMs
    };
  }

  let stream;
  let audioContext;
  let analyser;
  let animationFrameId = null;
  const buffer = new Float32Array(2048);
  const noteSegments = [];
  let activeSegment = null;
  let totalVolume = 0;
  let volumeSamples = 0;
  let maxVolume = 0;
  let audioDetected = false;
  const startedAt = performance.now();
  const silenceThreshold = 0.012;
  const onsetThreshold = 0.018;
  const segmentGapMs = 180;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextCtor();
    await audioContext.resume();

    analyser = audioContext.createAnalyser();
    analyser.fftSize = buffer.length;
    analyser.smoothingTimeConstant = 0.15;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    return await new Promise((resolve) => {
      const finish = (extra = {}) => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }

        stream.getTracks().forEach((track) => track.stop());
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }

        const averageVolume = volumeSamples > 0 ? totalVolume / volumeSamples : 0;
        const detectedNotes = noteSegments.map((segment) => segment.pitchClass).filter(Boolean);

        resolve({
          captureMode: 'microphone',
          audioDetected: audioDetected || detectedNotes.length > 0 || averageVolume > silenceThreshold,
          noAudioDetected: averageVolume < silenceThreshold || detectedNotes.length === 0,
          averageVolume,
          maxVolume,
          durationMs,
          detectedNotes,
          noteSegments,
          reason: averageVolume < silenceThreshold || detectedNotes.length === 0 ? 'No clear audio detected.' : 'Microphone analyzed successfully.',
          ...extra
        });
      };

      const frame = () => {
        const elapsedMs = performance.now() - startedAt;
        const remainingMs = Math.max(0, durationMs - elapsedMs);

        analyser.getFloatTimeDomainData(buffer);
        const rms = calculateRms(buffer);
        totalVolume += rms;
        volumeSamples += 1;
        maxVolume = Math.max(maxVolume, rms);

        const pitchSample = autoCorrelate(buffer, audioContext.sampleRate);
        const noteName = pitchSample ? frequencyToNoteName(pitchSample.frequency) : null;
        const pitchConfidence = pitchSample?.confidence ?? 0;

        if (rms >= silenceThreshold) {
          audioDetected = true;
        }

        const pitchedSample =
          pitchSample && pitchConfidence >= 0.3 && rms >= onsetThreshold
            ? {
                frequency: pitchSample.frequency,
                confidence: pitchConfidence,
                rms,
                noteName,
                pitchClass: pitchClass(noteName)
              }
            : null;

        if (pitchedSample?.pitchClass) {
          audioDetected = true;

          // This prototype groups stable pitch frames into note segments instead of doing full transcription.
          if (!activeSegment) {
            activeSegment = createSegment(pitchedSample, elapsedMs);
          } else if (
            activeSegment.pitchClass === pitchedSample.pitchClass &&
            elapsedMs - activeSegment.lastSeenMs <= segmentGapMs
          ) {
            updateSegment(activeSegment, pitchedSample, elapsedMs);
          } else {
            const finalized = finalizeSegment(activeSegment);
            if (finalized) {
              noteSegments.push(finalized);
            }

            activeSegment = createSegment(pitchedSample, elapsedMs);
          }
        } else if (activeSegment && elapsedMs - activeSegment.lastSeenMs > segmentGapMs) {
          const finalized = finalizeSegment(activeSegment);
          if (finalized) {
            noteSegments.push(finalized);
          }
          activeSegment = null;
        }

        const liveDetectedNotes = [...noteSegments.map((segment) => segment.pitchClass)];
        if (activeSegment?.pitchClass) {
          liveDetectedNotes.push(activeSegment.pitchClass);
        }

        onUpdate?.({
          elapsedMs,
          remainingMs,
          rms,
          averageVolume: volumeSamples > 0 ? totalVolume / volumeSamples : 0,
          maxVolume,
          audioDetected,
          liveNote: activeSegment?.pitchClass || null,
          pitchFrequency: pitchedSample?.frequency ?? null,
          pitchConfidence,
          detectedNotes: liveDetectedNotes,
          noteSegments: [...noteSegments, ...(activeSegment ? [{ ...finalizedSegmentPreview(activeSegment) }] : [])].filter(Boolean)
        });

        if (remainingMs <= 0) {
          const finalSegment = finalizeSegment(activeSegment);
          if (finalSegment) {
            noteSegments.push(finalSegment);
          }
          finish();
          return;
        }

        animationFrameId = requestAnimationFrame(frame);
      };

      animationFrameId = requestAnimationFrame(frame);
    });
  } catch (error) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }

    return {
      captureMode: 'denied',
      noAudioDetected: true,
      audioDetected: false,
      reason: error?.message || 'Microphone permission denied.',
      averageVolume: 0,
      maxVolume: 0,
      detectedNotes: [],
      noteSegments: [],
      durationMs
    };
  }
}

function finalizedSegmentPreview(segment) {
  return {
    noteName: segment.pitchClass,
    pitchClass: segment.pitchClass,
    startMs: segment.startMs,
    durationMs: Math.max(0, segment.lastSeenMs - segment.startMs),
    endMs: segment.lastSeenMs,
    frequency: segment.frequencyTotal / segment.frames,
    confidence: segment.confidenceTotal / segment.frames,
    averageRms: segment.rmsTotal / segment.frames,
    frames: segment.frames
  };
}