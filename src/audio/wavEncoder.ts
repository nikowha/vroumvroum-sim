// Encodage WAV (RIFF) : PCM 24 bits ou flottant 32 bits.

export type WavSampleFormat = 'pcm24' | 'float32';

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const PCM24_MAX_VALUE = 8388607;

/**
 * Encode des canaux audio en fichier WAV.
 * @param channels un Float32Array par canal (même longueur)
 * @param sampleRate fréquence d'échantillonnage (Hz)
 * @param sampleFormat 'pcm24' ou 'float32'
 * @returns contenu du fichier WAV
 */
export function encodeWav(channels: Float32Array[], sampleRate: number, sampleFormat: WavSampleFormat): ArrayBuffer {
  const channelCount = channels.length;
  const frameCount = channels[0]?.length ?? 0;
  const isFloat = sampleFormat === 'float32';
  const bytesPerSample = isFloat ? 4 : 3;
  const blockAlign = channelCount * bytesPerSample;
  const dataByteLength = frameCount * blockAlign;
  // L'en-tête float contient un bloc « fact » en plus (exigé pour les formats non PCM).
  const formatChunkSize = isFloat ? 18 : 16;
  const factChunkByteLength = isFloat ? 12 : 0;
  const headerByteLength = 12 + 8 + formatChunkSize + factChunkByteLength + 8;

  const fileBuffer = new ArrayBuffer(headerByteLength + dataByteLength);
  const view = new DataView(fileBuffer);
  let byteOffset = 0;
  const writeText = (text: string): void => {
    for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
      view.setUint8(byteOffset++, text.charCodeAt(characterIndex));
    }
  };
  const writeUint32 = (value: number): void => {
    view.setUint32(byteOffset, value, true);
    byteOffset += 4;
  };
  const writeUint16 = (value: number): void => {
    view.setUint16(byteOffset, value, true);
    byteOffset += 2;
  };

  writeText('RIFF');
  writeUint32(fileBuffer.byteLength - 8);
  writeText('WAVE');
  writeText('fmt ');
  writeUint32(formatChunkSize);
  writeUint16(isFloat ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM);
  writeUint16(channelCount);
  writeUint32(sampleRate);
  writeUint32(sampleRate * blockAlign);
  writeUint16(blockAlign);
  writeUint16(bytesPerSample * 8);
  if (isFloat) {
    writeUint16(0);
    writeText('fact');
    writeUint32(4);
    writeUint32(frameCount);
  }
  writeText('data');
  writeUint32(dataByteLength);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      const sample = channels[channelIndex][frameIndex];
      if (isFloat) {
        view.setFloat32(byteOffset, sample, true);
        byteOffset += 4;
      } else {
        const clampedSample = Math.max(-1, Math.min(1, sample));
        const integerSample = Math.round(clampedSample * PCM24_MAX_VALUE);
        view.setUint8(byteOffset, integerSample & 0xff);
        view.setUint8(byteOffset + 1, (integerSample >> 8) & 0xff);
        view.setUint8(byteOffset + 2, (integerSample >> 16) & 0xff);
        byteOffset += 3;
      }
    }
  }
  return fileBuffer;
}
