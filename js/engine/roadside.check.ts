import { asphaltSpan, branchEdges, goreSpan, shellEdge } from './fork.ts';
import { besidePose } from './roadside.ts';
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

const highway = branchEdges(10, 22);
assert(shellEdge(highway, 1) === highway.rightOuter, 'декор справа стоит снаружи съезда, не в клине');
assert(shellEdge(highway, -1) === -10, 'левая кромка прямой не двигается');

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

(globalThis as { console?: { log: (message: string) => void } }).console?.log('roadside contract ok');
