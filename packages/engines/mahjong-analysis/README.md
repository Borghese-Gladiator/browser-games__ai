# @browser-games/engine-mahjong-analysis

Analysis helpers for the Taiwanese mahjong engine. The package ranks discards,
measures completion distance and estimates the tai (台) that a seat can reach.

## Tai interpretation

The tai catalogue and the `estimateTai` estimator use the **standard Taiwanese
16-tile (十六張) interpretation**. A winning hand has five melds plus one pair,
for a total of seventeen tiles. The `RULESET` in `src/analysis/ruleset.ts` is the
single source of tai values. Every pattern carries a stable `id`, an English
name, a Chinese name, a tai value and a one-sentence rule.

Implemented patterns and their tai values:

| id | Chinese | English | tai |
| --- | --- | --- | --- |
| `self_draw` | 自摸 | Self-draw | 1 |
| `dealer` | 莊家 | Dealer | 1 |
| `concealed_hand` | 門清 | Concealed hand | 1 |
| `three_concealed_triplets` | 三暗刻 | Three concealed triplets | 2 |
| `dragon_triplet` | 三元牌 | Dragon triplet | 1 |
| `seat_wind` | 門風 | Seat wind | 1 |
| `round_wind` | 圈風 | Round wind | 1 |
| `all_triplets` | 碰碰胡 | All triplets | 4 |
| `full_flush` | 清一色 | Full flush | 8 |
| `half_flush` | 混一色 | Half flush | 4 |
| `seven_pairs` | 七對 | Seven pairs | 4 |
| `flower` | 花牌 | Flower | 1 |
| `seat_flower` | 正花 | Seat flower | 1 |

## `estimateTai(position)`

`estimateTai` reads public information only: the seat's own concealed tiles,
exposed melds, revealed flowers, seat wind, round wind, the dealer flag and the
ruleset. It returns three cumulative tiers:

- **guaranteed** — patterns locked by exposed melds, flowers, seat wind or the
  dealer flag.
- **on-track** — the intersection of pattern sets over every closest winning
  hand at the minimum completion distance.
- **potential** — the union of pattern sets over winning hands up to the minimum
  distance plus one.

The tiers nest (`guaranteed ⊆ on-track ⊆ potential`) and the cumulative tai
totals never decrease. The reachable-hand search is bounded to the minimum
distance plus one, memoized on tile counts and capped so the estimate stays
interactive.
