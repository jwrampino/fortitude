# Fortitude bot training report

- Trained for 15.0 minutes, 488 iterations, 249856 training games on 8 worker(s)
- Length penalty: starts at round 25, quadratic over 45 rounds, strength 1, capped at 1.5
- Move scoring: actor-critic (learned critic baseline)
- Evaluation: 500 games per row, the bot rotating through every seat, playing its best move each time
- "x Chance" is win rate divided by 1/seats. 1.00 means no better than luck; 2.00 means twice as often as luck.

## Against the built-in bots

| Opponents | Seats | Win rate | By chance | x Chance | Rounds mean / median / 90th pct | Ended by Jokers | Ended by last King | Stalemate |
|---|---|---|---|---|---|---|---|---|
| easy | 2 | 69.0% | 50.0% | 1.38 | 21.8 / 18 / 41 | 27.6% | 72.4% | 0.0% |
| easy | 3 | 71.6% | 33.3% | 2.15 | 24.3 / 19 / 43 | 3.2% | 96.8% | 0.0% |
| easy | 4 | 67.7% | 25.0% | 2.71 | 26.6 / 24 / 43 | 1.6% | 98.4% | 0.0% |
| easy | 5 | 63.7% | 20.0% | 3.18 | 29.1 / 26 / 45 | 0.4% | 99.6% | 0.0% |
| easy | 6 | 59.3% | 16.7% | 3.56 | 30.8 / 28 / 47 | 0.2% | 99.8% | 0.0% |
| normal | 2 | 75.8% | 50.0% | 1.52 | 21.5 / 18 / 39 | 32.3% | 67.7% | 0.0% |
| normal | 3 | 69.4% | 33.3% | 2.08 | 24.4 / 21 / 42 | 8.5% | 91.5% | 0.0% |
| normal | 4 | 61.1% | 25.0% | 2.44 | 28.5 / 26 / 47 | 2.0% | 98.0% | 0.0% |
| normal | 5 | 65.7% | 20.0% | 3.28 | 28.1 / 25 / 46 | 0.2% | 99.8% | 0.0% |
| normal | 6 | 60.3% | 16.7% | 3.62 | 30.6 / 28 / 48 | 0.0% | 100.0% | 0.0% |
| hard | 2 | 72.0% | 50.0% | 1.44 | 21.0 / 19 / 36 | 26.4% | 73.6% | 0.0% |
| hard | 3 | 66.1% | 33.3% | 1.98 | 25.2 / 22 / 43 | 5.4% | 94.6% | 0.0% |
| hard | 4 | 63.9% | 25.0% | 2.56 | 26.8 / 24 / 46 | 2.2% | 97.8% | 0.0% |
| hard | 5 | 57.1% | 20.0% | 2.86 | 28.6 / 26 / 45 | 0.2% | 99.8% | 0.0% |
| hard | 6 | 57.1% | 16.7% | 3.43 | 29.9 / 27 / 47 | 0.0% | 100.0% | 0.0% |

**Summary vs Hard:** average 2.45x chance, average game length 26.3 rounds, 0.0% stalemates, 6.8% Joker endings.

## Training curve (quick checks vs Hard, 2 to 6 seats)

| Iteration | Minutes | x Chance | Mean rounds |
|---|---|---|---|
| 0 | 0.0 | 1.39 | 26.9 |
| 20 | 0.5 | 1.66 | 26.3 |
| 40 | 1.1 | 1.98 | 27.1 |
| 60 | 2.1 | 2.17 | 30.0 |
| 80 | 2.7 | 2.50 | 29.7 |
| 100 | 3.3 | 2.55 | 30.4 |
| 120 | 3.9 | 2.53 | 30.0 |
| 140 | 4.5 | 2.09 | 25.0 |
| 160 | 5.0 | 2.46 | 25.4 |
| 180 | 5.6 | 2.47 | 27.2 |
| 200 | 6.2 | 2.28 | 28.4 |
| 220 | 6.8 | 2.44 | 27.6 |
| 240 | 7.4 | 2.42 | 27.2 |
| 260 | 8.0 | 2.52 | 28.3 |
| 280 | 8.6 | 2.71 | 29.3 |
| 300 | 9.3 | 2.37 | 27.0 |
| 320 | 9.9 | 2.62 | 29.6 |
| 340 | 10.5 | 2.68 | 29.4 |
| 360 | 11.1 | 2.58 | 26.7 |
| 380 | 11.8 | 2.42 | 26.7 |
| 400 | 12.4 | 2.23 | 28.0 |
| 420 | 13.0 | 2.40 | 26.6 |
| 440 | 13.6 | 2.38 | 26.0 |
| 460 | 14.2 | 2.42 | 24.9 |
| 480 | 14.8 | 2.38 | 26.0 |

