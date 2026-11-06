/** Окно вдоль дороги. Новый объект на трассе не пишет свои «если уехал за спину». */

/** Переносит s на span, если он вышел из окна. ahead = Infinity — догонять только сзади. */
export function keepInWindow(s, playerS, behind, ahead, span) {
  if (s < playerS - behind) return s + span;
  if (s > playerS + ahead) return s - span;
  return s;
}

/** Ставит объект на дорогу только когда s сменилось. Возвращает s, которое уже поставлено. */
export function placeIfMoved(placedS, s, place) {
  if (placedS === s) return placedS;
  place(s);
  return s;
}
