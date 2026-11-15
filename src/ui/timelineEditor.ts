// Éditeur de timeline sur <canvas> : règle (tête de lecture) + une piste par courbe d'automation.
// Souris, doigt et Apple Pencil via Pointer Events.

import { insertCurvePoint, moveCurvePoint, removeCurvePoint, evaluateCurve } from '../model/automationCurve.ts';
import type { CurveKey, Project } from '../model/project.ts';

export interface LaneDefinition {
  curveKey: CurveKey;
  label: string;
  color: string;
  minValue: number;
  /** Valeur maximale de la piste (peut dépendre du projet, ex. régime max du profil). */
  getMaxValue: (project: Project) => number;
  /** Nombre de décimales affichées. */
  valueDecimals: number;
}

export interface TimelineEditorCallbacks {
  onCurvesChanged: () => void;
  onSeek: (timeSeconds: number) => void;
}

interface LaneRectangle {
  top: number;
  height: number;
}

type DragState =
  | { kind: 'none' }
  | { kind: 'seek'; pointerId: number }
  | {
      kind: 'point';
      pointerId: number;
      laneIndex: number;
      pointIndex: number;
      startClientX: number;
      startClientY: number;
      hasMoved: boolean;
      longPressTimer: number;
    };

const RULER_HEIGHT = 28;
const LANE_GAP = 10;
const LEFT_MARGIN = 56;
const RIGHT_MARGIN = 16;
const LANE_VERTICAL_PADDING = 8;
const MOUSE_HIT_RADIUS = 10;
const TOUCH_HIT_RADIUS = 22;
const POINT_RADIUS = 6;
const DRAG_START_THRESHOLD_PIXELS = 6;
const LONG_PRESS_MILLISECONDS = 550;
const CURVE_SAMPLE_STEP_PIXELS = 2;
const VALUE_GRID_DIVISIONS = 4;

const COLORS = {
  background: '#15171c',
  laneBackground: '#1d2027',
  grid: '#2c313b',
  text: '#9aa3b2',
  playhead: '#ffcc33',
};

export class TimelineEditor {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly lanes: LaneDefinition[];
  private readonly getProject: () => Project;
  private readonly callbacks: TimelineEditorCallbacks;
  private playheadTimeSeconds = 0;
  private dragState: DragState = { kind: 'none' };
  private cssWidth = 0;
  private cssHeight = 0;
  private isRenderScheduled = false;

  /**
   * @param canvas canvas d'affichage
   * @param lanes pistes à afficher, de haut en bas
   * @param getProject renvoie le projet courant (lu à chaque dessin)
   * @param callbacks fonctions appelées après modification des courbes ou déplacement de la tête de lecture
   */
  constructor(canvas: HTMLCanvasElement, lanes: LaneDefinition[], getProject: () => Project, callbacks: TimelineEditorCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('TimelineEditor: contexte 2D indisponible');
    this.context = context;
    this.lanes = lanes;
    this.getProject = getProject;
    this.callbacks = callbacks;

    new ResizeObserver(() => this.resizeCanvas()).observe(canvas);
    canvas.addEventListener('pointerdown', (pointerEvent) => this.handlePointerDown(pointerEvent));
    canvas.addEventListener('pointermove', (pointerEvent) => this.handlePointerMove(pointerEvent));
    canvas.addEventListener('pointerup', (pointerEvent) => this.handlePointerEnd(pointerEvent));
    canvas.addEventListener('pointercancel', (pointerEvent) => this.handlePointerEnd(pointerEvent));
    canvas.addEventListener('dblclick', (mouseEvent) => this.handleDoubleClick(mouseEvent));
    this.resizeCanvas();
  }

  /**
   * Place la tête de lecture et redessine.
   * @param timeSeconds instant (s)
   */
  setPlayheadTime(timeSeconds: number): void {
    this.playheadTimeSeconds = timeSeconds;
    this.requestRender();
  }

  /** Demande un redessin à la prochaine image (évite de redessiner plusieurs fois par image). */
  requestRender(): void {
    if (this.isRenderScheduled) return;
    this.isRenderScheduled = true;
    requestAnimationFrame(() => {
      this.isRenderScheduled = false;
      this.render();
    });
  }

  // ---------- Géométrie ----------

  /** Adapte la résolution du canvas à sa taille affichée et à la densité de pixels de l'écran. */
  private resizeCanvas(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    this.cssWidth = bounds.width;
    this.cssHeight = bounds.height;
    this.canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.render();
  }

  /**
   * @param timeSeconds instant (s)
   * @returns position horizontale (px CSS)
   */
  private timeToX(timeSeconds: number): number {
    const usableWidth = this.cssWidth - LEFT_MARGIN - RIGHT_MARGIN;
    return LEFT_MARGIN + (timeSeconds / this.getProject().durationSeconds) * usableWidth;
  }

  /**
   * @param positionX position horizontale (px CSS)
   * @returns instant (s), borné à la durée du projet
   */
  private xToTime(positionX: number): number {
    const usableWidth = this.cssWidth - LEFT_MARGIN - RIGHT_MARGIN;
    const durationSeconds = this.getProject().durationSeconds;
    const timeSeconds = ((positionX - LEFT_MARGIN) / usableWidth) * durationSeconds;
    return Math.min(Math.max(timeSeconds, 0), durationSeconds);
  }

  /**
   * @param laneIndex index de la piste
   * @returns position et hauteur de la piste (px CSS)
   */
  private getLaneRectangle(laneIndex: number): LaneRectangle {
    const laneCount = this.lanes.length;
    const laneHeight = (this.cssHeight - RULER_HEIGHT - LANE_GAP * laneCount) / laneCount;
    return { top: RULER_HEIGHT + LANE_GAP + laneIndex * (laneHeight + LANE_GAP), height: laneHeight };
  }

  /**
   * @param laneIndex index de la piste
   * @param value valeur de la courbe
   * @returns position verticale (px CSS)
   */
  private valueToY(laneIndex: number, value: number): number {
    const lane = this.lanes[laneIndex];
    const laneRectangle = this.getLaneRectangle(laneIndex);
    const maxValue = lane.getMaxValue(this.getProject());
    const normalizedValue = Math.min(Math.max((value - lane.minValue) / (maxValue - lane.minValue), 0), 1);
    const drawableHeight = laneRectangle.height - 2 * LANE_VERTICAL_PADDING;
    return laneRectangle.top + LANE_VERTICAL_PADDING + (1 - normalizedValue) * drawableHeight;
  }

  /**
   * @param laneIndex index de la piste
   * @param positionY position verticale (px CSS)
   * @returns valeur, bornée aux limites de la piste
   */
  private yToValue(laneIndex: number, positionY: number): number {
    const lane = this.lanes[laneIndex];
    const laneRectangle = this.getLaneRectangle(laneIndex);
    const maxValue = lane.getMaxValue(this.getProject());
    const drawableHeight = laneRectangle.height - 2 * LANE_VERTICAL_PADDING;
    const normalizedValue = 1 - (positionY - laneRectangle.top - LANE_VERTICAL_PADDING) / drawableHeight;
    const clampedValue = Math.min(Math.max(normalizedValue, 0), 1);
    return lane.minValue + clampedValue * (maxValue - lane.minValue);
  }

  /**
   * @param positionY position verticale (px CSS)
   * @returns index de la piste sous ce point, ou -1
   */
  private findLaneAt(positionY: number): number {
    return this.lanes.findIndex((_lane, laneIndex) => {
      const laneRectangle = this.getLaneRectangle(laneIndex);
      return positionY >= laneRectangle.top && positionY <= laneRectangle.top + laneRectangle.height;
    });
  }

  /**
   * Cherche le point le plus proche dans une piste.
   * @param laneIndex index de la piste
   * @param positionX position horizontale (px CSS)
   * @param positionY position verticale (px CSS)
   * @param hitRadius rayon de détection (px CSS)
   * @returns index du point touché, ou -1
   */
  private findPointAt(laneIndex: number, positionX: number, positionY: number, hitRadius: number): number {
    const curve = this.getProject().curves[this.lanes[laneIndex].curveKey];
    let closestIndex = -1;
    let closestDistance = hitRadius;
    curve.points.forEach((curvePoint, pointIndex) => {
      const distance = Math.hypot(this.timeToX(curvePoint.time) - positionX, this.valueToY(laneIndex, curvePoint.value) - positionY);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closestIndex = pointIndex;
      }
    });
    return closestIndex;
  }

  /**
   * @param pointerEvent événement pointeur ou souris
   * @returns position dans le canvas (px CSS)
   */
  private getLocalPosition(pointerEvent: MouseEvent): { positionX: number; positionY: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return { positionX: pointerEvent.clientX - bounds.left, positionY: pointerEvent.clientY - bounds.top };
  }

  // ---------- Interaction ----------

  /**
   * Début d'un contact : règle → déplacer la tête de lecture ; point → le saisir ; vide → créer un point.
   * @param pointerEvent événement pointeur
   */
  private handlePointerDown(pointerEvent: PointerEvent): void {
    if (this.dragState.kind !== 'none' || pointerEvent.button > 0) return;
    const { positionX, positionY } = this.getLocalPosition(pointerEvent);
    this.canvas.setPointerCapture(pointerEvent.pointerId);

    if (positionY < RULER_HEIGHT) {
      this.dragState = { kind: 'seek', pointerId: pointerEvent.pointerId };
      this.callbacks.onSeek(this.xToTime(positionX));
      return;
    }

    const laneIndex = this.findLaneAt(positionY);
    if (laneIndex < 0) return;
    const hitRadius = pointerEvent.pointerType === 'mouse' ? MOUSE_HIT_RADIUS : TOUCH_HIT_RADIUS;
    let pointIndex = this.findPointAt(laneIndex, positionX, positionY, hitRadius);
    const isNewPoint = pointIndex < 0;
    if (isNewPoint) {
      const curve = this.getProject().curves[this.lanes[laneIndex].curveKey];
      pointIndex = insertCurvePoint(curve, { time: this.xToTime(positionX), value: this.yToValue(laneIndex, positionY) });
      this.notifyCurvesChanged();
    }

    const longPressTimer = isNewPoint
      ? 0
      : window.setTimeout(() => this.deletePointOnLongPress(), LONG_PRESS_MILLISECONDS);
    this.dragState = {
      kind: 'point',
      pointerId: pointerEvent.pointerId,
      laneIndex,
      pointIndex,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      hasMoved: isNewPoint,
      longPressTimer,
    };
  }

  /**
   * Déplacement : glisser la tête de lecture ou le point saisi ; sinon changer le curseur de la souris.
   * @param pointerEvent événement pointeur
   */
  private handlePointerMove(pointerEvent: PointerEvent): void {
    const dragState = this.dragState;
    const { positionX, positionY } = this.getLocalPosition(pointerEvent);

    if (dragState.kind === 'none') {
      this.updateHoverCursor(positionX, positionY);
      return;
    }
    if (dragState.pointerId !== pointerEvent.pointerId) return;
    if (dragState.kind === 'seek') {
      this.callbacks.onSeek(this.xToTime(positionX));
      return;
    }

    const travelDistance = Math.hypot(pointerEvent.clientX - dragState.startClientX, pointerEvent.clientY - dragState.startClientY);
    if (!dragState.hasMoved && travelDistance < DRAG_START_THRESHOLD_PIXELS) return;
    dragState.hasMoved = true;
    window.clearTimeout(dragState.longPressTimer);

    const project = this.getProject();
    const curve = project.curves[this.lanes[dragState.laneIndex].curveKey];
    moveCurvePoint(curve, dragState.pointIndex, this.xToTime(positionX), this.yToValue(dragState.laneIndex, positionY), project.durationSeconds);
    this.notifyCurvesChanged();
  }

  /**
   * Fin d'un contact.
   * @param pointerEvent événement pointeur
   */
  private handlePointerEnd(pointerEvent: PointerEvent): void {
    const dragState = this.dragState;
    if (dragState.kind === 'none' || dragState.pointerId !== pointerEvent.pointerId) return;
    if (dragState.kind === 'point') window.clearTimeout(dragState.longPressTimer);
    this.dragState = { kind: 'none' };
  }

  /** Appui long sans bouger sur un point (doigt / Pencil) : supprime le point. */
  private deletePointOnLongPress(): void {
    const dragState = this.dragState;
    if (dragState.kind !== 'point' || dragState.hasMoved) return;
    this.deletePoint(dragState.laneIndex, dragState.pointIndex);
    this.dragState = { kind: 'none' };
  }

  /**
   * Double-clic (souris) sur un point : le supprime.
   * @param mouseEvent événement souris
   */
  private handleDoubleClick(mouseEvent: MouseEvent): void {
    const { positionX, positionY } = this.getLocalPosition(mouseEvent);
    const laneIndex = this.findLaneAt(positionY);
    if (laneIndex < 0) return;
    const pointIndex = this.findPointAt(laneIndex, positionX, positionY, MOUSE_HIT_RADIUS);
    if (pointIndex >= 0) this.deletePoint(laneIndex, pointIndex);
  }

  /**
   * Supprime un point d'une piste.
   * @param laneIndex index de la piste
   * @param pointIndex index du point
   */
  private deletePoint(laneIndex: number, pointIndex: number): void {
    const curve = this.getProject().curves[this.lanes[laneIndex].curveKey];
    if (removeCurvePoint(curve, pointIndex)) this.notifyCurvesChanged();
  }

  /**
   * Curseur souris : main au-dessus d'un point, croix ailleurs.
   * @param positionX position horizontale (px CSS)
   * @param positionY position verticale (px CSS)
   */
  private updateHoverCursor(positionX: number, positionY: number): void {
    const laneIndex = this.findLaneAt(positionY);
    const isOverPoint = laneIndex >= 0 && this.findPointAt(laneIndex, positionX, positionY, MOUSE_HIT_RADIUS) >= 0;
    this.canvas.style.cursor = positionY < RULER_HEIGHT ? 'col-resize' : isOverPoint ? 'grab' : 'crosshair';
  }

  /** Prévient l'application et redessine. */
  private notifyCurvesChanged(): void {
    this.callbacks.onCurvesChanged();
    this.requestRender();
  }

  // ---------- Dessin ----------

  /** Dessine toute la timeline. */
  render(): void {
    const context = this.context;
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, this.cssWidth, this.cssHeight);
    this.drawRuler();
    this.lanes.forEach((_lane, laneIndex) => this.drawLane(laneIndex));
    this.drawPlayhead();
  }

  /** Règle des secondes en haut. */
  private drawRuler(): void {
    const context = this.context;
    const durationSeconds = this.getProject().durationSeconds;
    const tickStepSeconds = chooseTickStep(durationSeconds, this.cssWidth - LEFT_MARGIN - RIGHT_MARGIN);
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    for (let tickTime = 0; tickTime <= durationSeconds + 1e-6; tickTime += tickStepSeconds) {
      const tickX = Math.round(this.timeToX(tickTime)) + 0.5;
      context.strokeStyle = COLORS.grid;
      context.beginPath();
      context.moveTo(tickX, RULER_HEIGHT - 8);
      context.lineTo(tickX, this.cssHeight);
      context.stroke();
      context.fillStyle = COLORS.text;
      context.fillText(`${Number(tickTime.toFixed(2))}s`, tickX, RULER_HEIGHT / 2 - 2);
    }
  }

  /**
   * Une piste : fond, grille de valeurs, courbe, points, nom.
   * @param laneIndex index de la piste
   */
  private drawLane(laneIndex: number): void {
    const context = this.context;
    const lane = this.lanes[laneIndex];
    const project = this.getProject();
    const curve = project.curves[lane.curveKey];
    const laneRectangle = this.getLaneRectangle(laneIndex);
    const maxValue = lane.getMaxValue(project);
    const startX = this.timeToX(0);
    const endX = this.timeToX(project.durationSeconds);

    context.fillStyle = COLORS.laneBackground;
    context.fillRect(startX, laneRectangle.top, endX - startX, laneRectangle.height);

    context.textAlign = 'right';
    context.font = '10px system-ui, sans-serif';
    for (let divisionIndex = 0; divisionIndex <= VALUE_GRID_DIVISIONS; divisionIndex++) {
      const gridValue = lane.minValue + ((maxValue - lane.minValue) * divisionIndex) / VALUE_GRID_DIVISIONS;
      const gridY = Math.round(this.valueToY(laneIndex, gridValue)) + 0.5;
      context.strokeStyle = COLORS.grid;
      context.beginPath();
      context.moveTo(startX, gridY);
      context.lineTo(endX, gridY);
      context.stroke();
      context.fillStyle = COLORS.text;
      context.fillText(String(Math.round(gridValue)), LEFT_MARGIN - 6, gridY);
    }

    context.strokeStyle = lane.color;
    context.lineWidth = 2;
    context.beginPath();
    for (let sampleX = startX; sampleX <= endX; sampleX += CURVE_SAMPLE_STEP_PIXELS) {
      const sampleY = this.valueToY(laneIndex, evaluateCurve(curve, this.xToTime(sampleX)));
      if (sampleX === startX) context.moveTo(sampleX, sampleY);
      else context.lineTo(sampleX, sampleY);
    }
    context.stroke();
    context.lineWidth = 1;

    context.fillStyle = lane.color;
    for (const curvePoint of curve.points) {
      context.beginPath();
      context.arc(this.timeToX(curvePoint.time), this.valueToY(laneIndex, curvePoint.value), POINT_RADIUS, 0, 2 * Math.PI);
      context.fill();
    }

    context.textAlign = 'left';
    context.font = '600 12px system-ui, sans-serif';
    context.fillStyle = lane.color;
    const currentValue = evaluateCurve(curve, this.playheadTimeSeconds);
    context.fillText(`${lane.label} : ${currentValue.toFixed(lane.valueDecimals)}`, startX + 8, laneRectangle.top + 14);
  }

  /** Ligne verticale de la tête de lecture. */
  private drawPlayhead(): void {
    const context = this.context;
    const playheadX = Math.round(this.timeToX(this.playheadTimeSeconds)) + 0.5;
    context.strokeStyle = COLORS.playhead;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(playheadX, 0);
    context.lineTo(playheadX, this.cssHeight);
    context.stroke();
    context.lineWidth = 1;
  }
}

/**
 * Choisit l'écart entre graduations de la règle pour garder environ 70 px entre deux étiquettes.
 * @param durationSeconds durée affichée (s)
 * @param widthPixels largeur disponible (px)
 * @returns écart entre graduations (s)
 */
function chooseTickStep(durationSeconds: number, widthPixels: number): number {
  const MIN_TICK_SPACING_PIXELS = 70;
  const CANDIDATE_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const pixelsPerSecond = widthPixels / durationSeconds;
  return CANDIDATE_STEPS.find((stepSeconds) => stepSeconds * pixelsPerSecond >= MIN_TICK_SPACING_PIXELS) ?? 300;
}
