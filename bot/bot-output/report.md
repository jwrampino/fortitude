# Fortitude bot training report

- Trained for 3.0 minutes, 160 iterations, 81920 training games on 8 worker(s)
- Length penalty: starts at round 25, quadratic over 45 rounds, strength 1, capped at 1.5
- Evaluation: 500 games per row, the bot rotating through every seat, playing its best move each time
- "x Chance" is win rate divided by 1/seats. 1.00 means no better than luck; 2.00 means twice as often as luck.

## Against the built-in bots

| Opponents | Seats | Win rate | By chance | x Chance | Rounds mean / median / 90th pct | Ended by Jokers | Ended by last King | Stalemate |
|---|---|---|---|---|---|---|---|---|
| easy | 2 | 76.8% | 50.0% | 1.54 | 17.5 / 16 / 30 | 24.8% | 75.2% | 0.0% |
| easy | 3 | 76.4% | 33.3% | 2.29 | 24.3 / 22 / 39 | 8.9% | 91.1% | 0.0% |
| easy | 4 | 75.8% | 25.0% | 3.03 | 28.0 / 26 / 44 | 3.2% | 96.8% | 0.0% |
| easy | 5 | 73.4% | 20.0% | 3.67 | 31.3 / 28 / 50 | 0.8% | 99.2% | 0.0% |
| easy | 6 | 73.8% | 16.7% | 4.43 | 33.2 / 31 / 51 | 0.0% | 100.0% | 0.0% |
| normal | 2 | 80.4% | 50.0% | 1.61 | 18.3 / 17 / 31 | 30.6% | 69.4% | 0.0% |
| normal | 3 | 71.6% | 33.3% | 2.15 | 25.6 / 23 / 42 | 9.5% | 90.5% | 0.0% |
| normal | 4 | 70.6% | 25.0% | 2.83 | 28.4 / 25 / 47 | 2.4% | 97.6% | 0.0% |
| normal | 5 | 71.2% | 20.0% | 3.56 | 30.4 / 28 / 48 | 1.4% | 98.6% | 0.0% |
| normal | 6 | 66.9% | 16.7% | 4.01 | 35.2 / 31 / 57 | 0.2% | 99.8% | 0.0% |
| hard | 2 | 77.4% | 50.0% | 1.55 | 17.5 / 16 / 31 | 29.6% | 70.4% | 0.0% |
| hard | 3 | 71.2% | 33.3% | 2.14 | 24.3 / 22 / 41 | 10.3% | 89.7% | 0.0% |
| hard | 4 | 70.0% | 25.0% | 2.80 | 28.3 / 25 / 47 | 5.0% | 95.0% | 0.0% |
| hard | 5 | 65.1% | 20.0% | 3.25 | 30.1 / 27 / 48 | 0.4% | 99.6% | 0.0% |
| hard | 6 | 64.1% | 16.7% | 3.85 | 31.4 / 28 / 51 | 0.0% | 100.0% | 0.0% |

**Summary vs Hard:** average 2.72x chance, average game length 26.3 rounds, 0.0% stalemates, 9.0% Joker endings.

## Training curve (quick checks vs Hard, 2 to 6 seats)

| Iteration | Minutes | x Chance | Mean rounds |
|---|---|---|---|
| 0 | 0.0 | 1.30 | 26.7 |
| 20 | 0.6 | 1.80 | 29.0 |
| 40 | 0.8 | 1.86 | 25.4 |
| 60 | 1.2 | 2.06 | 23.8 |
| 80 | 1.5 | 2.48 | 30.5 |
| 100 | 1.9 | 2.84 | 29.7 |
| 120 | 2.2 | 2.27 | 22.6 |
| 140 | 2.6 | 2.75 | 27.2 |
| 160 | 3.0 | 2.75 | 26.5 |

