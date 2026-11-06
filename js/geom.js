import * as THREE from 'three';

const cache = new Map();

function shared(kind, args, create) {
  const key = kind + '\0' + args.join('\0');
  let geo = cache.get(key);
  if (!geo) {
    geo = create();
    cache.set(key, geo);
  }
  return geo;
}

// Геометрии только для чтения. Поворот и сдвиг — на меше, не на geometry.
export function box(w, h, d) {
  return shared('box', [w, h, d], () => new THREE.BoxGeometry(w, h, d));
}

export function cylinder(radiusTop, radiusBottom, height, segments) {
  return shared('cyl', [radiusTop, radiusBottom, height, segments], () =>
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments));
}

export function plane(w, h) {
  return shared('plane', [w, h], () => new THREE.PlaneGeometry(w, h));
}
