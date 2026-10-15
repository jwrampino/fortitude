# Fortitude bot training report

- Trained for 15.1 minutes, 452 iterations, 231424 training games on 8 worker(s)
- Length penalty: starts at round 25, quadratic over 45 rounds, strength 1, capped at 1.5
- Evaluation: 500 games per row, the bot rotating through every seat, playing its best move each time
- "x Chance" is win rate divided by 1/seats. 1.00 means no better than luck; 2.00 means twice as often as luck.

## Against the built-in bots

| Opponents | Seats | Win rate | By chance | x Chance | Rounds mean / median / 90th pct | Ended by Jokers | Ended by last King | Stalemate |
|---|---|---|---|---|---|---|---|---|
| easy | 2 | 76.6% | 50.0% | 1.53 | 17.6 / 16 / 29 | 10.3% | 89.7% | 0.0% |
| easy | 3 | 68.1% | 33.3% | 2.04 | 21.4 / 19 / 36 | 3.4% | 96.6% | 0.0% |
| easy | 4 | 66.1% | 25.0% | 2.64 | 23.8 / 21 / 40 | 1.0% | 99.0% | 0.0% |
| easy | 5 | 64.1% | 20.0% | 3.20 | 24.9 / 23 / 38 | 0.4% | 99.6% | 0.0% |
| easy | 6 | 61.7% | 16.7% | 3.70 | 27.5 / 25 / 43 | 0.0% | 100.0% | 0.0% |
| normal | 2 | 74.6% | 50.0% | 1.49 | 18.7 / 16 / 32 | 14.1% | 85.9% | 0.0% |
| normal | 3 | 66.5% | 33.3% | 1.99 | 21.7 / 19 / 36 | 4.4% | 95.6% | 0.0% |
| normal | 4 | 60.5% | 25.0% | 2.42 | 25.0 / 22 / 40 | 1.6% | 98.4% | 0.0% |
| normal | 5 | 57.9% | 20.0% | 2.90 | 27.1 / 25 / 45 | 0.2% | 99.8% | 0.0% |
| normal | 6 | 57.1% | 16.7% | 3.43 | 28.9 / 26 / 45 | 0.2% | 99.8% | 0.0% |
| hard | 2 | 69.0% | 50.0% | 1.38 | 19.7 / 16 / 36 | 12.5% | 87.5% | 0.0% |
| hard | 3 | 62.1% | 33.3% | 1.86 | 21.9 / 19 / 37 | 4.2% | 95.8% | 0.0% |
| hard | 4 | 58.9% | 25.0% | 2.36 | 25.1 / 22 / 41 | 1.8% | 98.2% | 0.0% |
| hard | 5 | 58.3% | 20.0% | 2.92 | 26.3 / 24 / 41 | 0.0% | 100.0% | 0.0% |
| hard | 6 | 50.0% | 16.7% | 3.00 | 28.0 / 26 / 41 | 0.4% | 99.6% | 0.0% |

**Summary vs Hard:** average 2.30x chance, average game length 24.2 rounds, 0.0% stalemates, 3.8% Joker endings.

## Training curve (quick checks vs Hard, 2 to 6 seats)

| Iteration | Minutes | x Chance | Mean rounds |
|---|---|---|---|
| 0 | 0.0 | 1.29 | 27.4 |
| 50 | 1.0 | 2.07 | 24.8 |
| 100 | 1.8 | 2.50 | 27.8 |
| 150 | 2.8 | 2.28 | 23.5 |
| 200 | 4.9 | 2.62 | 27.1 |
| 250 | 6.6 | 2.62 | 27.8 |
| 300 | 9.9 | 2.58 | 27.6 |
| 350 | 11.5 | 2.71 | 25.7 |
| 400 | 13.1 | 2.50 | 24.8 |
| 450 | 14.9 | 2.41 | 22.8 |

