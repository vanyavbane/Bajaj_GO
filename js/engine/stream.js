/** Окно вдоль дороги. Новый объект на трассе не пишет свои «если уехал за спину». */

/** Переносит s на span, если он вышел из окна. ahead = Infinity — догонять только сзади. */
export function keepInWindow(s, playerS, behind, ahead, span) {
  if (s < playerS - behind) return s + span;
  if (s > playerS + ahead) return s - span;
  return s;
}

/** Ставит объект, когда сменилась точка s или поза. pose — целое число снаружи.
 *  Без позы ключ равен s, как раньше. */
export function placeIfMoved(placedKey, s, place, pose = null) {
  const key = pose == null ? s : `${s}|${pose}`;
  if (placedKey === key) return placedKey;
  place(s);
  return key;
}
