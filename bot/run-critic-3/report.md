# Fortitude bot training report

- Trained for 3.0 minutes, 186 iterations, 95232 training games on 8 worker(s)
- Length penalty: starts at round 25, quadratic over 45 rounds, strength 1, capped at 1.5
- Move scoring: actor-critic (learned critic baseline)
- Evaluation: 500 games per row, the bot rotating through every seat, playing its best move each time
- "x Chance" is win rate divided by 1/seats. 1.00 means no better than luck; 2.00 means twice as often as luck.

## Against the built-in bots

| Opponents | Seats | Win rate | By chance | x Chance | Rounds mean / median / 90th pct | Ended by Jokers | Ended by last King | Stalemate |
|---|---|---|---|---|---|---|---|---|
| easy | 2 | 75.8% | 50.0% | 1.52 | 18.2 / 16 / 32 | 21.6% | 78.4% | 0.0% |
| easy | 3 | 77.0% | 33.3% | 2.31 | 22.8 / 20 / 38 | 7.1% | 92.9% | 0.0% |
| easy | 4 | 72.0% | 25.0% | 2.88 | 27.4 / 24 / 47 | 3.0% | 97.0% | 0.0% |
| easy | 5 | 73.4% | 20.0% | 3.67 | 30.3 / 27 / 48 | 0.2% | 99.8% | 0.0% |
| easy | 6 | 73.2% | 16.7% | 4.39 | 32.3 / 30 / 50 | 0.0% | 100.0% | 0.0% |
| normal | 2 | 80.4% | 50.0% | 1.61 | 19.7 / 17 / 36 | 26.4% | 73.6% | 0.0% |
| normal | 3 | 72.8% | 33.3% | 2.18 | 25.2 / 22 / 42 | 9.7% | 90.3% | 0.0% |
| normal | 4 | 66.1% | 25.0% | 2.64 | 28.0 / 25 / 46 | 2.4% | 97.6% | 0.0% |
| normal | 5 | 66.1% | 20.0% | 3.30 | 31.4 / 28 / 50 | 0.2% | 99.8% | 0.0% |
| normal | 6 | 67.1% | 16.7% | 4.02 | 32.5 / 30 / 50 | 0.2% | 99.8% | 0.0% |
| hard | 2 | 80.8% | 50.0% | 1.62 | 19.2 / 17 / 35 | 29.2% | 70.8% | 0.0% |
| hard | 3 | 68.8% | 33.3% | 2.07 | 24.0 / 21 / 41 | 7.3% | 92.7% | 0.0% |
| hard | 4 | 63.7% | 25.0% | 2.55 | 28.2 / 26 / 44 | 2.4% | 97.6% | 0.0% |
| hard | 5 | 61.9% | 20.0% | 3.10 | 29.5 / 27 / 46 | 0.4% | 99.6% | 0.0% |
| hard | 6 | 62.9% | 16.7% | 3.77 | 31.8 / 30 / 48 | 0.0% | 100.0% | 0.0% |

**Summary vs Hard:** average 2.62x chance, average game length 26.5 rounds, 0.0% stalemates, 7.9% Joker endings.

## Training curve (quick checks vs Hard, 2 to 6 seats)

| Iteration | Minutes | x Chance | Mean rounds |
|---|---|---|---|
| 0 | 0.0 | 1.30 | 26.7 |
| 20 | 0.2 | 1.72 | 26.2 |
| 40 | 0.5 | 2.04 | 28.1 |
| 60 | 0.8 | 1.96 | 25.4 |
| 80 | 1.0 | 2.01 | 24.1 |
| 100 | 1.4 | 2.17 | 24.2 |
| 120 | 1.7 | 2.18 | 25.7 |
| 140 | 2.1 | 2.15 | 30.4 |
| 160 | 2.5 | 2.41 | 25.4 |
| 180 | 2.9 | 2.45 | 24.0 |

