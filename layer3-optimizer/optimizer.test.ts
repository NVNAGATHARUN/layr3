// ============================================================
// optimizer.test.ts
// Interactive test — User provides traffic data manually
// Use this for live demo / explaining logic to non-coders
//
// NOTE: Ambulance/emergency handling is NOT part of normal
// scoring input here — that's Member 3's domain via
// pauseOptimizer/resumeOptimizer. This file only collects
// normal vehicle traffic data.
// ============================================================

import * as readline from "readline";
import { ApproachMetrics }       from "./weighted-demand";
import { runMaxPressureOptimizer,
         DownstreamDensity,
         PhaseState }            from "./max-pressure-optimizer";

function createRL() {
  return readline.createInterface({
    input: process.stdin, output: process.stdout,
  });
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, a => resolve(a.trim())));
}

async function askNum(
  rl: readline.Interface,
  q: string,
  min = 0,
  max = 9999,
  def = 0
): Promise<number> {
  while (true) {
    const input = await ask(rl, q);
    if (input === "") return def;
    const n = parseFloat(input);
    if (!isNaN(n) && n >= min && n <= max) return n;
    console.log(`   ⚠️  Enter a number between ${min} and ${max}`);
  }
}

function header(title: string) {
  console.log("\n" + "═".repeat(55));
  console.log(`   ${title}`);
  console.log("═".repeat(55));
}

function divider() {
  console.log("\n" + "─".repeat(55));
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function collectApproach(
  rl: readline.Interface,
  index: number,
  total: number,
  usedDirections: string[]
): Promise<{ approach: ApproachMetrics; downstreamPct: number }> {

  header(`ROAD ${index + 1} of ${total}`);

  const available = ["NORTH","SOUTH","EAST","WEST"]
    .filter(d => !usedDirections.includes(d));
  console.log(`\n📍 Direction: ${available.join(" | ")}`);
  let direction = "";
  while (!available.includes(direction)) {
    direction = (await ask(rl, "   → ")).toUpperCase();
    if (!available.includes(direction))
      console.log("   ⚠️  Invalid direction");
  }

  divider();
  console.log(`\n🚗 Vehicles waiting on ${direction} road:\n`);
  const motorcycle    = await askNum(rl, "   🏍️  Motorcycles    : ", 0, 500);
  const car           = await askNum(rl, "   🚗  Cars           : ", 0, 500);
  const auto_rickshaw = await askNum(rl, "   🛺  Auto Rickshaws : ", 0, 500);
  const mini_truck    = await askNum(rl, "   🚐  Mini Trucks    : ", 0, 500);
  const bus           = await askNum(rl, "   🚌  Buses          : ", 0, 100);
  const heavy_truck   = await askNum(rl, "   🚛  Heavy Trucks   : ", 0, 100);

  const totalVehicles =
    motorcycle + car + auto_rickshaw +
    mini_truck + bus + heavy_truck;
  console.log(`\n   ✅ Total: ${totalVehicles} vehicles`);

  divider();
  console.log(`\n⏱️  Road conditions — ${direction}:\n`);

  const avgWaitingTime = await askNum(
    rl, "   Avg waiting time (seconds)      : ", 0, 600);
  const arrivalRate = await askNum(
    rl, "   New vehicles per minute         : ", 0, 200);
  const roadCapacity = await askNum(
    rl, "   Road max capacity (default 100) : ", 20, 1000, 100);
  const queueLength = Math.min(totalVehicles, roadCapacity);
  const lastGreenSeconds = await askNum(
    rl, "   Seconds since last green        : ", 0, 3600);

  divider();
  console.log(`\n🚦 Road AHEAD of ${direction} — how jammed?\n`);
  console.log("   0 = completely clear");
  console.log("   50 = half full");
  console.log("   100 = completely blocked\n");
  const downstreamPct = await askNum(
    rl, "   Jam level (0-100) : ", 0, 100);

  const detections = [
    { type: "motorcycle",    count: motorcycle    },
    { type: "car",           count: car           },
    { type: "auto_rickshaw", count: auto_rickshaw },
    { type: "mini_truck",    count: mini_truck    },
    { type: "bus",           count: bus           },
    { type: "heavy_truck",   count: heavy_truck   },
  ].filter(d => d.count > 0);

  return {
    approach: {
      direction,
      detections,
      avgWaitingTime,
      arrivalRate,
      queueLength,
      roadCapacity,
      hasBus:               bus > 0,
      hasEmergencyVehicle:  false,  // Member 3 handles EMV via pause/resume
      lastGreenSeconds,
    },
    downstreamPct,
  };
}

async function main() {
  console.clear();
  header("🚦 LAYER 3 — SMART TRAFFIC OPTIMIZER (Manual Test)");
  console.log("\n   Member 1 + Member 2 — Complete Pipeline Test\n");

  const rl = createRL();

  divider();
  const junctionId = await ask(
    rl, "\n   Junction ID (e.g. JN-042) : ");

  const numApproaches = Math.round(await askNum(
    rl, "   Number of roads (2/3/4)   : ", 2, 4, 4));

  divider();
  console.log("\n📷 Camera / Weather condition:\n");
  console.log("   1 → Clear (camera perfect)");
  console.log("   2 → Light fog or rain");
  console.log("   3 → Heavy fog / camera fault\n");
  const weatherChoice = await askNum(rl, "   → Choice (1/2/3) : ", 1, 3, 1);
  const confidenceMap: Record<number, number> = { 1: 0.95, 2: 0.75, 3: 0.40 };
  const confidence = confidenceMap[weatherChoice] ?? 0.95;

  const approaches:  ApproachMetrics[]  = [];
  const downstream:  DownstreamDensity[] = [];
  const usedDirs:    string[]            = [];

  for (let i = 0; i < numApproaches; i++) {
    const { approach, downstreamPct } =
      await collectApproach(rl, i, numApproaches, usedDirs);
    usedDirs.push(approach.direction);
    approaches.push(approach);
    downstream.push({
      direction: approach.direction,
      occupancyPct: downstreamPct,
    });
  }

  header("CURRENT SIGNAL STATE");
  console.log("\n   Which road is currently GREEN?\n");
  approaches.forEach((a, i) =>
    console.log(`   ${i + 1} → ${a.direction}`));

  const phaseChoice = Math.round(await askNum(
    rl, "\n   → Number : ", 1, numApproaches, 1));
  const currentDir =
    approaches[phaseChoice - 1]?.direction ?? approaches[0].direction;

  const phaseElapsed = await askNum(
    rl, "\n   Seconds elapsed in current green : ", 0, 90, 0);

  console.log("\n   Traffic density on current green road:");
  console.log("   1 → Light  2 → Moderate  3 → Heavy\n");
  const densityChoice = await askNum(rl, "   → ", 1, 3, 2);
  const densityMap: Record<number, "low"|"medium"|"high"> =
    { 1: "low", 2: "medium", 3: "high" };

  const currentPhase: PhaseState = {
    currentPhaseId:       `PHASE_${currentDir}_GREEN`,
    phaseElapsedSeconds:  phaseElapsed,
    currentGreenDuration: 40,
    currentDensity:       densityMap[densityChoice] ?? "medium",
  };

  rl.close();

  header("⚙️  CALCULATING...");
  await sleep(600);
  console.log("   ✅ Vehicle weights applied");
  await sleep(400);
  console.log("   ✅ Priority scores calculated");
  await sleep(400);
  console.log("   ✅ Max-pressure phase selected");
  await sleep(400);
  console.log("   ✅ Green duration computed");
  await sleep(400);
  console.log("   ✅ Spillback & starvation checked");

  const plan = runMaxPressureOptimizer(
    junctionId, approaches, downstream,
    currentPhase, confidence
  );

  header("📊 ALL ROADS — COMPARISON");
  console.log(
    "\n   " +
    "ROAD".padEnd(8) + "SCORE".padEnd(9) +
    "PRESSURE".padEnd(12) + "PEOPLE".padEnd(9) +
    "SPILLBACK".padEnd(11) + "STATUS"
  );
  console.log("   " + "─".repeat(57));

  const sorted = Object.entries(plan.priorityScores)
    .sort((a, b) => b[1] - a[1]);
  const medals = ["🥇","🥈","🥉","4️⃣ "];

  sorted.forEach(([dir, score], i) => {
    const pressure  = plan.pressureSnapshot[dir]?.toFixed(1) ?? "0";
    const people    = plan.personFlows[dir]     ?? 0;
    const spillback = plan.spillbackFlags[dir]  ? "⚠️  YES" : "NO";
    const isWinner  = dir === plan.winningDirection;
    const status    = isWinner ? "🟢 GREEN" : "🔴 RED";

    console.log(
      `   ${medals[i]} ${dir.padEnd(6)}` +
      `${score.toFixed(1).padEnd(9)}` +
      `${pressure.padEnd(12)}` +
      `${people.toString().padEnd(9)}` +
      `${spillback.padEnd(11)}` +
      `${status}`
    );
  });

  header("🏆 FINAL SIGNAL PLAN");

  if (plan.dataSource === "HISTORICAL") {
    console.log("\n   ⚠️  Camera confidence too low!");
    console.log("   📂 Using historical timing as fallback.");
    console.log(`   🟢 Default green: ${plan.greenDuration}s per phase`);
  } else {
    console.log(`\n   🟢 GREEN → ${plan.winningDirection} road`);
    console.log(`   ⏱️  Duration → ${plan.greenDuration} seconds`);
    console.log(`   🟡 Yellow  → ${plan.yellowDuration} seconds`);
    console.log(`   🔴 All-Red → ${plan.allRedDuration} seconds`);

    if (plan.extendGreen)
      console.log("\n   🔄 GREEN EXTENDED +10s (high density detected)");

    const starvedDir = Object.entries(plan.starvationFlags)
      .find(([, v]) => v)?.[0];
    if (starvedDir)
      console.log(
        `\n   ⚠️  STARVATION on ${starvedDir} — ` +
        `not been green for 3+ minutes. Served next cycle.`
      );
  }

  divider();
  console.log("\n   📤 SENDING TO MEMBER 4 (Safety Supervisor):\n");
  console.log(JSON.stringify({
    junctionId:    plan.junctionId,
    targetPhaseId: plan.targetPhaseId,
    greenDuration: plan.greenDuration,
    yellowDuration: plan.yellowDuration,
    allRedDuration: plan.allRedDuration,
    dataSource:    plan.dataSource,
    timestamp:     plan.timestamp,
  }, null, 4));

  divider();
  console.log("\n   ✅ Member 1 & 2 pipeline complete.\n");
}

main().catch(console.error);