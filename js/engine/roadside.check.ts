import { asphaltSpan, branchEdges, goreSpan, mainRoadOpen, shellEdge } from './fork.ts';
import {
  besidePose,
  medianFits,
  medianPose,
  medianRoom,
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

const open: RoadsideFrame = { edges: straight, origin: 0 };
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
const both: RoadsideFrame = { edges: fork, origin: 0 };
const outside = besidePose(both, { side: -1, gap: 8, inset: 0 });
assert(outside.lateral === -44, 'разъезд: объект снаружи внешней кромки, не в зазоре');
assert(Math.abs(medianRoom(fork) - 25.84) < 1e-9, 'островок доходит до внутренней кромки');
assert(medianFits(fork, { halfWidth: 2, gap: 3.2 }), 'дерево с зазором помещается на островок');
assert(!medianFits(fork, { halfWidth: 30, gap: 0 }), 'объект шире островка не ставится');
assert(medianRoom(straight) === 0, 'на прямой островка нет');

const highway = branchEdges(10, 22);
assert(shellEdge(highway, 1) === highway.rightOuter, 'декор справа стоит снаружи съезда, не в клине');
assert(shellEdge(highway, -1) === -10, 'левая кромка прямой не двигается');
assert(Math.abs(medianRoom(highway) - (highway.rightInner - highway.leftInner) * 0.5) < 1e-9, 'клин съезда считается от его середины до асфальта');
const inGore = medianPose(highway, { halfWidth: 1, gap: 1 });
assert(inGore.lateral != null && inGore.lateral > highway.leftInner && inGore.lateral < highway.rightInner, 'островок стоит в клине, не на асфальте');

const settled = branchEdges(10, 0);
assert(shellEdge(settled, -1) === -10 && shellEdge(settled, 1) === 10, 'когда съезд стал дорогой, кромки у него');
const carried: AsphaltEdges = { leftOuter: 22, leftInner: 42, rightInner: 42, rightOuter: 42 };
const carriedFrame: RoadsideFrame = { edges: carried, origin: 32 };
const carriedLeft = besidePose(carriedFrame, { side: -1, gap: 8, inset: 0 });
const carriedRight = besidePose(carriedFrame, { side: 1, gap: 8, inset: 0 });
assert(carriedLeft.lateral === 14, 'после съезда левый декор остаётся слева от дороги');
assert(carriedRight.lateral === 50, 'после съезда правый декор остаётся справа от дороги');
const aside: AsphaltEdges = { leftOuter: 20, leftInner: 30, rightInner: 30, rightOuter: 30 };
const asideLeft = besidePose({ edges: aside, origin: 0 }, { side: -1, gap: 8, inset: 0 });
assert(asideLeft.lateral === 12, 'декор слева от съезда, даже если центр ещё на старой оси');
const shifted = { leftOuter: 22, leftInner: 42, rightInner: 54, rightOuter: 74 };
assert(mainRoadOpen(shifted, 32) && !mainRoadOpen(shifted), 'прямая лента жива вокруг своего центра');
assert(shellEdge(shifted, 1) === 74, 'декор справа за внешним асфальтом съезда');
const plainSpan = asphaltSpan(straight);
assert(plainSpan.left === -10 && plainSpan.right === 10 && plainSpan.mid === 0, 'прямая: портал от кромки до кромки');
const highwaySpan = asphaltSpan(highway);
assert(highwaySpan.left === -10 && highwaySpan.right === highway.rightOuter, 'съезд: портал накрывает прямую и ленту');
const carriedSpan = asphaltSpan(carried);
assert(carriedSpan.left === 22 && carriedSpan.right === 42 && carriedSpan.mid === 32, 'после съезда портал садится на новую дорогу');
const sliver: AsphaltEdges = { leftOuter: -30, leftInner: -29.2, rightInner: 12, rightOuter: 22 };
const sliverSpan = asphaltSpan(sliver);
assert(sliverSpan.left === -30 && sliverSpan.right === 22, 'узкая прямая ещё в портале, пока у неё есть ширина');
const gone: AsphaltEdges = { leftOuter: -30, leftInner: -29.8, rightInner: 12, rightOuter: 22 };
const goneSpan = asphaltSpan(gone);
assert(goneSpan.left === 12 && goneSpan.right === 22, 'когда прямая сошла, портал садится на съезд');
const openGore = goreSpan(branchEdges(10, 22));
assert(openGore != null && openGore.left >= 10 && openGore.right > openGore.left, 'парк стоит в клине открытого съезда');
const towed: AsphaltEdges = { leftOuter: -10, leftInner: 10, rightInner: 40, rightOuter: 49.5 };
assert(goreSpan(towed) == null, 'увезённый съезд не тащит парк за собой');
assert(goreSpan(carried) == null, 'когда съезд стал дорогой, клина для парка нет');
assert(Math.abs(medianRoom(shifted, 32) - 6) < 1e-9, 'клин после переноса центра сохраняет ширину');
const shiftedMedian: AsphaltEdges = { leftOuter: 16, leftInner: 26, rightInner: 38, rightOuter: 48 };
assert(Math.abs(medianRoom(shiftedMedian, 32) - 6) < 1e-9, 'островок считается от центра дороги, не от нуля маршрута');
assert(medianRoom(shiftedMedian, 0) === 0, 'щель мимо центра дороги островком не становится');

const clipped = medianPose(fork, { halfWidth: 1, gap: 3.2, lateral: 40 });
assert(clipped.lateral != null && Math.abs(clipped.lateral) <= 25.84 - 4.2 + 1e-9, 'сдвиг по островку не заходит на асфальт');

const hidden = medianPose(straight, { halfWidth: 1, gap: 1 });
assert(hidden.lateral === null, 'на прямой островок ничего не ставит');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('roadside contract ok');
