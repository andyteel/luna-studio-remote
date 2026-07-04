#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 48_000;
const BITS_PER_SAMPLE = 24;
const CHANNELS = 1;
const FREQUENCY_HZ = 1_000;
const SECTION_SECONDS = 2;
const FADE_SECONDS = 0.01;

const outputDir = dirname(fileURLToPath(import.meta.url));
const wavPath = join(outputDir, 'luna-meter-step-test.wav');
const csvPath = join(outputDir, 'luna-meter-step-test-map.csv');

const sections = [
  { label: 'silence', dbfs: null },
  { label: '-60 dBFS', dbfs: -60 },
  { label: '-50 dBFS', dbfs: -50 },
  { label: '-40 dBFS', dbfs: -40 },
  { label: '-30 dBFS', dbfs: -30 },
  { label: '-20 dBFS', dbfs: -20 },
  { label: '-12 dBFS', dbfs: -12 },
  { label: '-6 dBFS', dbfs: -6 },
  { label: '-3 dBFS', dbfs: -3 },
  { label: '-1 dBFS', dbfs: -1 },
  { label: 'silence', dbfs: null },
].map((section) => ({
  ...section,
  amplitude: section.dbfs === null ? 0 : 10 ** (section.dbfs / 20),
}));

const bytesPerSample = BITS_PER_SAMPLE / 8;
const sectionSamples = SAMPLE_RATE * SECTION_SECONDS;
const totalSamples = sectionSamples * sections.length;
const dataSize = totalSamples * CHANNELS * bytesPerSample;
const fadeSamples = Math.max(1, Math.round(SAMPLE_RATE * FADE_SECONDS));

function smoothStep(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function amplitudeAtSample(sampleIndex) {
  const sectionIndex = Math.min(
    sections.length - 1,
    Math.floor(sampleIndex / sectionSamples),
  );
  const sectionStart = sectionIndex * sectionSamples;
  const currentAmplitude = sections[sectionIndex].amplitude;

  if (sectionIndex === 0) {
    return currentAmplitude;
  }

  const samplesIntoSection = sampleIndex - sectionStart;
  if (samplesIntoSection >= fadeSamples) {
    return currentAmplitude;
  }

  const previousAmplitude = sections[sectionIndex - 1].amplitude;
  const fadeAmount = smoothStep(samplesIntoSection / fadeSamples);
  return previousAmplitude + (currentAmplitude - previousAmplitude) * fadeAmount;
}

function createWavBuffer() {
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);
  const blockAlign = CHANNELS * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = headerSize;
  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const phase = (2 * Math.PI * FREQUENCY_HZ * sampleIndex) / SAMPLE_RATE;
    const sample = Math.sin(phase) * amplitudeAtSample(sampleIndex);
    const int24 = Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fffff);
    buffer.writeIntLE(int24, offset, bytesPerSample);
    offset += bytesPerSample;
  }

  return buffer;
}

function formatAmplitude(amplitude) {
  return amplitude === 0 ? '0' : amplitude.toPrecision(12);
}

function createCsv() {
  const rows = ['start_seconds,end_seconds,label,dbfs,expected_linear_amplitude'];

  sections.forEach((section, index) => {
    const startSeconds = index * SECTION_SECONDS;
    const endSeconds = startSeconds + SECTION_SECONDS;
    rows.push([
      startSeconds.toFixed(3),
      endSeconds.toFixed(3),
      section.label,
      section.dbfs === null ? '-Infinity' : section.dbfs,
      formatAmplitude(section.amplitude),
    ].join(','));
  });

  return `${rows.join('\n')}\n`;
}

writeFileSync(wavPath, createWavBuffer());
writeFileSync(csvPath, createCsv());

console.log(`Wrote ${wavPath}`);
console.log(`Wrote ${csvPath}`);
console.log(`${SAMPLE_RATE} Hz, ${BITS_PER_SAMPLE}-bit PCM, mono, ${totalSamples / SAMPLE_RATE}s`);
