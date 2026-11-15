// Téléchargement et ouverture de fichiers (projet JSON, WAV exporté).

/**
 * Propose un fichier au téléchargement.
 * @param fileBlob contenu
 * @param fileName nom proposé
 */
export function downloadBlob(fileBlob: Blob, fileName: string): void {
  const REVOKE_DELAY_MILLISECONDS = 10000;
  const objectUrl = URL.createObjectURL(fileBlob);
  const linkElement = document.createElement('a');
  linkElement.href = objectUrl;
  linkElement.download = fileName;
  document.body.append(linkElement);
  linkElement.click();
  linkElement.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_DELAY_MILLISECONDS);
}

/**
 * Ouvre le sélecteur de fichier et lit le fichier choisi comme texte.
 * @param fileInput champ <input type="file"> caché
 * @returns texte du fichier
 */
export function pickTextFile(fileInput: HTMLInputElement): Promise<string> {
  return new Promise((resolve, reject) => {
    fileInput.value = '';
    fileInput.onchange = () => {
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) {
        reject(new Error('pickTextFile: aucun fichier choisi'));
        return;
      }
      selectedFile.text().then(resolve, reject);
    };
    fileInput.click();
  });
}

/**
 * Horodatage court pour les noms de fichiers (ex. 2026-11-15_1842).
 * @returns texte
 */
export function createFileTimestamp(): string {
  const now = new Date();
  const twoDigits = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}_${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;
}
