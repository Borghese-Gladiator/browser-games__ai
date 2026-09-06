# Mahjong Engine

This package implements the **Taiwanese 16-tile** mahjong variant.

## Rules

The engine follows `DEFAULT_TAIWANESE_RULES`: 4 players, a concealed hand of 16
tiles, a 17-tile winning hand, flowers enabled, and a dealer that repeats on a
win. Seven pairs is enabled as an alternative winning pattern.

## Scoring

The scoring module reports the win value in *tai*. `TAI_VALUES` holds the tai for
each pattern: self-draw, all-triplets, all-one-suit, half-flush, seven-pairs, the
dealer bonus, and flowers (with an extra bonus for a flower that matches the
player seat). `scoreHand` evaluates every valid decomposition of a completed hand
and returns the `ScoreResult` for the branch with the highest total tai.
