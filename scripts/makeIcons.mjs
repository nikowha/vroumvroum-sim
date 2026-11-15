// Génère les icônes PNG de l'app (compte-tours stylisé) sans dépendance : npm run make-icons

import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BACKGROUND = [21, 23, 28];
const ACCENT = [255, 122, 69];
const NEEDLE = [255, 204, 51];

/**
 * Couleur d'un pixel de l'icône (coordonnées normalisées -1..1).
 * @param normalizedX abscisse
 * @param normalizedY ordonnée (vers le bas)
 * @returns couleur [r, g, b]
 */
function getIconPixelColor(normalizedX, normalizedY) {
  const radius = Math.hypot(normalizedX, normalizedY);
  const angle = Math.atan2(normalizedY, normalizedX);
  const isOnDialArc = radius > 0.62 && radius < 0.78 && !(angle > Math.PI / 4 && angle < (3 * Math.PI) / 4);
  const needleAngle = -Math.PI / 4;
  const alongNeedle = normalizedX * Math.cos(needleAngle) + normalizedY * Math.sin(needleAngle);
  const acrossNeedle = -normalizedX * Math.sin(needleAngle) + normalizedY * Math.cos(needleAngle);
  const isOnNeedle = alongNeedle > -0.1 && alongNeedle < 0.6 && Math.abs(acrossNeedle) < 0.06;
  if (isOnNeedle || radius < 0.12) return NEEDLE;
  if (isOnDialArc) return ACCENT;
  return BACKGROUND;
}

/**
 * Construit un fichier PNG RGB.
 * @param size côté de l'image (px)
 * @returns contenu PNG
 */
function createIconPng(size) {
  const rowLength = 1 + size * 3;
  const rawPixels = Buffer.alloc(rowLength * size);
  for (let rowIndex = 0; rowIndex < size; rowIndex++) {
    for (let columnIndex = 0; columnIndex < size; columnIndex++) {
      const color = getIconPixelColor((columnIndex / size) * 2 - 1, (rowIndex / size) * 2 - 1);
      rawPixels.set(color, rowIndex * rowLength + 1 + columnIndex * 3);
    }
  }
  const createChunk = (chunkType, chunkData) => {
    const lengthBytes = Buffer.alloc(4);
    lengthBytes.writeUInt32BE(chunkData.length);
    const typeAndData = Buffer.concat([Buffer.from(chunkType, 'ascii'), chunkData]);
    const crcBytes = Buffer.alloc(4);
    crcBytes.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([lengthBytes, typeAndData, crcBytes]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(rawPixels)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const iconSize of [192, 512]) writeFileSync(`public/icon-${iconSize}.png`, createIconPng(iconSize));
console.log('Icônes écrites dans public/');
