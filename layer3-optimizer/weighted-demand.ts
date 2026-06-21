// ============================================================
// weighted-demand.ts
// Member 1 — Heuristic Score Engineer
//
// RESPONSIBILITY:
//   Takes raw vehicle detection data
//   Returns priorityScore per approach
//
// USED BY:
//   Member 2 → max-pressure-optimizer.ts
//   Member 5 → feeds ApproachMetrics input to us
// ============================================================

// ─── Vehicle Weight Table ────────────────────────────────────
export const VEHICLE_WEIGHTS: Record<string, number> = {
  motorcycle:    0.5,
  car:           1.0,
  auto_rickshaw: 1.2,
  mini_truck:    2.0,
  bus:           3.0,
  heavy_truck:   4.0,
  ambulance:     10.0,
};

// ─── Average Occupancy Per Vehicle Type ─────────────────────
export const AVERAGE_OCCUPANCY: Record<string, number> = {
  motorcycle:    1.0,
  car:           1.5,
  auto_rickshaw: 2.0,
  mini_truck:    1.5,
  bus:           45.0,
  heavy_truck:   1.0,
  ambulance:     3.0,
};

// ─── Types ───────────────────────────────────────────────────
export interface VehicleDetection {
  type: string;
  count: number;
}

export interface ApproachMetrics {
  direction: string;
  detections: VehicleDetection[];
  avgWaitingTime: number;
  arrivalRate: number;
  queueLength: number;
  roadCapacity: number;
  hasBus: boolean;
  hasEmergencyVehicle: boolean;
  lastGreenSeconds: number;
}

export interface ScoredApproach {
  direction: string;
  weightedDemand: number;
  personFlow: number;
  priorityScore: number;
  spillbackBoost: boolean;
  starvationOverride: boolean;
}

// ─── Constants ───────────────────────────────────────────────
const SPILLBACK_THRESHOLD  = 0.80;
const SPILLBACK_BOOST      = 25;
const STARVATION_LIMIT_SEC = 180;
const STARVATION_BASELINE  = 25;

const W_DEMAND    = 0.40;
const W_WAITING   = 0.25;
const W_ARRIVAL   = 0.20;
const W_BUS       = 0.10;
const W_EMERGENCY = 0.05;

// ─── Step 1: Weighted Demand ─────────────────────────────────
export function calculateWeightedDemand(
  detections: VehicleDetection[]
): number {
  return detections.reduce((total, vehicle) => {
    const weight = VEHICLE_WEIGHTS[vehicle.type.toLowerCase()] ?? 1.0;
    return total + vehicle.count * weight;
  }, 0);
}

// ─── Step 2: Person-Centric Flow ─────────────────────────────
export function calculatePersonFlow(
  detections: VehicleDetection[]
): number {
  return detections.reduce((total, vehicle) => {
    const occupancy = AVERAGE_OCCUPANCY[vehicle.type.toLowerCase()] ?? 1.5;
    return total + vehicle.count * occupancy;
  }, 0);
}

// ─── Step 3: Priority Score ───────────────────────────────────
export function calculatePriorityScore(
  metrics: ApproachMetrics
): ScoredApproach {

  const weightedDemand = calculateWeightedDemand(metrics.detections);
  const personFlow     = calculatePersonFlow(metrics.detections);

  const busWeight       = metrics.hasBus ? 3.0 : 0;
  const emergencyWeight = metrics.hasEmergencyVehicle ? 10.0 : 0;

  let priorityScore =
    W_DEMAND    * weightedDemand         +
    W_WAITING   * metrics.avgWaitingTime +
    W_ARRIVAL   * metrics.arrivalRate    +
    W_BUS       * busWeight              +
    W_EMERGENCY * emergencyWeight;

  let spillbackBoost   = false;
  const occupancyRatio = metrics.queueLength / metrics.roadCapacity;

  if (occupancyRatio >= SPILLBACK_THRESHOLD) {
    priorityScore += SPILLBACK_BOOST;
    spillbackBoost = true;
    console.log(
      `[SPILLBACK] ${metrics.direction}: ` +
      `${(occupancyRatio * 100).toFixed(1)}% capacity → +${SPILLBACK_BOOST} boost`
    );
  }

  let starvationOverride = false;

  if (metrics.lastGreenSeconds > STARVATION_LIMIT_SEC) {
    priorityScore      = Math.max(priorityScore, STARVATION_BASELINE);
    starvationOverride = true;
    console.log(
      `[STARVATION] ${metrics.direction}: ` +
      `${metrics.lastGreenSeconds}s since last green → forced to ${STARVATION_BASELINE}`
    );
  }

  return {
    direction:          metrics.direction.toUpperCase(),
    weightedDemand:     Math.round(weightedDemand * 100) / 100,
    personFlow:         Math.round(personFlow * 100) / 100,
    priorityScore:      Math.round(priorityScore * 100) / 100,
    spillbackBoost,
    starvationOverride,
  };
}

// ─── Main Export: Score All Approaches ───────────────────────
export function scoreAllApproaches(
  approaches: ApproachMetrics[]
): ScoredApproach[] {
  return approaches.map(calculatePriorityScore);
}