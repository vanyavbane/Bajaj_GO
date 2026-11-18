import { branchEdges, exitEdges } from './fork.ts';
import {
  besidePose,
  medianFits,
  medianPose,
  medianRoom,
  outerEdge,
  sideOpen,
} from './roadside.ts';
import type { AsphaltEdges, RoadsideFrame } from './roadside.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const straight: AsphaltEdges = {
  leftOuter: -10,
  leftInner: 0.16,
  rightInner: -0.16,
  rightOuter: 10,
};

const open: RoadsideFrame = { edges: straight, chosenSide: 0 };
const right = besidePose(open, { side: 1, gap: 2, inset: 1 });
assert(right.lateral === 13 && right.absLat === 13, 'прямая: правый объект за кромкой на зазор и выступ');

const left = besidePose(open, { side: -1, gap: 8, inset: 0 });
assert(left.lateral === -18 && left.absLat === 18, 'прямая: левый объект зеркально');

const fork: AsphaltEdges = {
  leftOuter: -36,
  leftInner: -25.84,
  rightInner: 25.84,
  rightOuter: 36,
};
const both: RoadsideFrame = { edges: fork, chosenSide: 0 };
const outside = besidePose(both, { side: -1, gap: 8, inset: 0 });
assert(outside.lateral === -44, 'разъезд: объект снаружи внешней кромки, не в зазоре');
assert(Math.abs(medianRoom(fork) - 25.84) < 1e-9, 'островок доходит до внутренней кромки');
assert(medianFits(fork, { halfWidth: 2, gap: 3.2 }), 'дерево с зазором помещается на островок');
assert(!medianFits(fork, { halfWidth: 30, gap: 0 }), 'объект шире островка не ставится');
assert(medianRoom(straight) === 0, 'на прямой островка нет');

const highway = branchEdges(10, 22);
assert(outerEdge(highway, 1) === 10, 'декор справа держится за прямую, не за внешний край съезда');
assert(outerEdge(highway, -1) === -10, 'левая кромка прямой не двигается');
assert(Math.abs(medianRoom(highway) - (highway.rightInner - highway.leftInner) * 0.5) < 1e-9, 'клин съезда считается от его середины до асфальта');
const inGore = medianPose(highway, { halfWidth: 1, gap: 1 });
assert(inGore.lateral != null && inGore.lateral > highway.leftInner && inGore.lateral < highway.rightInner, 'островок стоит в клине, не на асфальте');

const settled = exitEdges(10, { kind: 'settle', t: 1, spread: 22 }, 1);
assert(outerEdge(settled, -1) === -10 && outerEdge(settled, 1) === 10, 'когда съезд стал дорогой, кромки у него');
assert(sideOpen(1, -1) && sideOpen(-1, 1), 'выбор не прячет обочину живой дороги');

const clipped = medianPose(fork, { halfWidth: 1, gap: 3.2, lateral: 40 });
assert(clipped.lateral != null && Math.abs(clipped.lateral) <= 25.84 - 4.2 + 1e-9, 'сдвиг по островку не заходит на асфальт');

const hidden = medianPose(straight, { halfWidth: 1, gap: 1 });
assert(hidden.lateral === null, 'на прямой островок ничего не ставит');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('roadside contract ok');
