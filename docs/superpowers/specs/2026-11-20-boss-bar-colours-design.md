# Boss HP bar colours (2026-11-20)

Short design, approved by the owner on 2026-11-20 ("Yes, show it behind").

## Why

Bosses now have 2 to 5 HP bars (server branch `boss-hp-respawn`, layered boss HP since 2026-11-11). The owner wants each
bar to look different: the original red on the first bar, a shade lighter on each next one, white on the last, so a
player sees at a glance how far the fight has gone.

## What

- Target bar only (`hud/targetBar.ts`), FlyffWeb only. Monsters with one bar (no HP_LAYER) keep Neuz's look exactly.
- Current bar colour by bars left: `t = (max - left) / (max - 1)`; colour from Neuz's fill ARGB(128, 255, 15, 15)
  (t = 0) to white (t = 1): R 255, G = B = round(15 + 240 t), alpha round(128 + (230 - 128) t). x2: red, white.
  x3: red, (255,135,135), white. x5: red, then 75, 135, 195, white.
- Behind the current bar, over the white empty gauge, the next bar's colour at full width; behind the last bar a dark grey
  ARGB(200, 64, 64, 64), so the white bar stays readable.
- The "xN" text stays.

## Approaches

- **Per-bar colour plus the next bar behind (picked by the owner):** the bar visibly peels into the lighter one.
- Only the current bar's colour changes, the empty part white until the last bar: simpler, but the change between bars is
  only seen when a bar empties.

## Left to the builder

- `Gauge.setColor` for a gauge whose colour changes; the alpha ramp (128 to 230) and the dark grey are first picks,
  checked on screenshots x5 to x1 (desktop and phone).
- Neuz keeps its plain red bar (players use the web client).
