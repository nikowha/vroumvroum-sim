// Courbes d'automation : points-clés (temps, valeur) et interpolation. Données pures, sans DOM.

export interface AutomationPoint {
  time: number;
  value: number;
}

export type InterpolationMode = 'linear' | 'smooth';

export interface AutomationCurve {
  points: AutomationPoint[];
  interpolation: InterpolationMode;
}

/**
 * Calcule la valeur d'une courbe à un instant donné.
 * Avant le premier point / après le dernier, la valeur reste constante.
 * @param curve courbe à évaluer (points triés par temps)
 * @param time instant en secondes
 * @returns valeur interpolée (0 si la courbe est vide)
 */
export function evaluateCurve(curve: AutomationCurve, time: number): number {
  const points = curve.points;
  if (points.length === 0) return 0;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (time <= firstPoint.time) return firstPoint.value;
  if (time >= lastPoint.time) return lastPoint.value;

  let lowIndex = 0;
  let highIndex = points.length - 1;
  while (highIndex - lowIndex > 1) {
    const middleIndex = (lowIndex + highIndex) >> 1;
    if (points[middleIndex].time <= time) lowIndex = middleIndex;
    else highIndex = middleIndex;
  }

  const startPoint = points[lowIndex];
  const endPoint = points[highIndex];
  const span = endPoint.time - startPoint.time;
  let progress = span > 0 ? (time - startPoint.time) / span : 0;
  if (curve.interpolation === 'smooth') progress = progress * progress * (3 - 2 * progress);
  return startPoint.value + (endPoint.value - startPoint.value) * progress;
}

/**
 * Ajoute un point à sa place (tri par temps).
 * @param curve courbe modifiée
 * @param newPoint point à insérer
 * @returns index du point inséré
 */
export function insertCurvePoint(curve: AutomationCurve, newPoint: AutomationPoint): number {
  let insertIndex = 0;
  while (insertIndex < curve.points.length && curve.points[insertIndex].time <= newPoint.time) insertIndex++;
  curve.points.splice(insertIndex, 0, newPoint);
  return insertIndex;
}

/**
 * Supprime un point, sauf s'il est le dernier de la courbe (une courbe garde toujours au moins un point).
 * @param curve courbe modifiée
 * @param pointIndex index du point à supprimer
 * @returns true si le point a été supprimé
 */
export function removeCurvePoint(curve: AutomationCurve, pointIndex: number): boolean {
  if (curve.points.length <= 1) return false;
  curve.points.splice(pointIndex, 1);
  return true;
}

/**
 * Déplace un point sans lui faire dépasser ses voisins (l'ordre des points reste stable pendant un glisser).
 * @param curve courbe modifiée
 * @param pointIndex index du point
 * @param time nouveau temps souhaité (s)
 * @param value nouvelle valeur souhaitée
 * @param maxTime temps maximal autorisé (durée du projet)
 */
export function moveCurvePoint(curve: AutomationCurve, pointIndex: number, time: number, value: number, maxTime: number): void {
  const MIN_POINT_SPACING_SECONDS = 0.001;
  const previousPoint = curve.points[pointIndex - 1];
  const nextPoint = curve.points[pointIndex + 1];
  const minTime = previousPoint ? previousPoint.time + MIN_POINT_SPACING_SECONDS : 0;
  const maxAllowedTime = nextPoint ? nextPoint.time - MIN_POINT_SPACING_SECONDS : maxTime;
  const movedPoint = curve.points[pointIndex];
  movedPoint.time = Math.min(Math.max(time, minTime), maxAllowedTime);
  movedPoint.value = value;
}
