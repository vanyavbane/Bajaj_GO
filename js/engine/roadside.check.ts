import { branchEdges, roadsJoined } from './fork.ts';
import { asphaltSpan, goreSpan, groundAt, shellEdge, shoulderLats, vergeAt, walkCrossing } from './asphalt.ts';
import { besidePose, spanEdges, stripSeam } from './roadside.ts';
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
assert(shellEdge(settled, -1) === -10 && shellEdge(settled, 1) === 10, 'когда съезда нет, кромки у дороги');
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
assert(goreSpan(carried) == null, 'у одной ленты клина для парка нет');
const split = branchEdges(10, 22);
assert(groundAt(split, 0).dist === 0, 'на асфальте прямой земля на уровне полотна');
const goreLat = (split.leftInner + split.rightInner) * 0.5;
const goreGround = groundAt(split, goreLat);
assert(goreGround.dist > goreGround.half, 'клин не считается полотном одной широкой дороги');
assert(groundAt(split, split.rightOuter + 4).half < 6, 'откос справа меряет ленту съезда, не обе ленты');
const driven = spanEdges({ left: 27, right: 37 });
const drivenLeft = besidePose({ edges: driven, origin: 0 }, { side: -1, gap: 2, inset: 0 });
const drivenRight = besidePose({ edges: driven, origin: 0 }, { side: 1, gap: 2, inset: 0 });
assert(drivenLeft.lateral === 25, 'объект слева стоит у дороги байка, не у дальней кромки прямой');
assert(drivenRight.lateral === 39, 'объект справа стоит у той же дороги');
assert(!stripSeam(10, 12), 'кромка одной дороги ленту не рвёт');
assert(stripSeam(10, 37), 'перескок на другую дорогу рвёт тротуар и откос');
assert(!stripSeam(null, 37), 'первая точка ленты не рвётся');

const nose = branchEdges(9.5, 0);
assert(vergeAt(nose, nose.leftInner, 3.55) === 3.55, 'у шоссе откос начинается за тротуаром');
const peeled = branchEdges(9.5, 8);
assert(vergeAt(peeled, peeled.rightOuter, 3.55) === 0, 'справа от съезда запас тротуара не оставляет дыру');
assert(vergeAt(peeled, peeled.leftOuter, 3.55) === 3.55, 'слева тротуар шоссе остаётся');
const skirt = shoulderLats(4.5, vergeAt(peeled, peeled.rightOuter, 3.55), {
  berm: 22, far: 95, lipY: 0.08, bermY: 1.8, farY: -4.5, cityEdge: 3.55,
});
assert(Math.abs(skirt.lip - 4.5) < 0.01, 'откос съезда начинается на кромке асфальта');
assert(walkCrossing(branchEdges(9.5, 0), 3.55) == null, 'на носе тротуар ещё не пересекает съезд');
const across = walkCrossing(branchEdges(9.5, 8), 3.55);
const acrossEdges = branchEdges(9.5, 8);
assert(across != null && across.near === acrossEdges.rightInner && across.far === acrossEdges.rightOuter, 'переход идёт от кромки съезда до кромки');
assert(walkCrossing(branchEdges(9.5, 22), 3.55) == null, 'съезд, ушедший с тротуара, переход не держит');
assert(roadsJoined(branchEdges(9.5, 3)), 'пока съезд приклеен, руль и картинка — одно полотно');
assert(!roadsJoined(branchEdges(9.5, 22)), 'открытый клин уже две дороги');
assert(!roadsJoined(branchEdges(9.5, 0)), 'на носе второй кромки нет');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('roadside contract ok');
