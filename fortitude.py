import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

# -----------------------------
# Card model + utilities
# -----------------------------

RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["♠", "♥", "♦", "♣"]

NUMERIC_RANKS = set(["2", "3", "4", "5", "6", "7", "8", "9", "10"])

def rank_value(rank: str) -> int:
    """Value for comparisons in attack/defense. Face cards are high, but note: rules restrict what can be played in certain contexts."""
    if rank in NUMERIC_RANKS:
        return int(rank)
    if rank == "J":
        return 11
    if rank == "Q":
        return 12
    if rank == "K":
        return 13
    if rank == "A":
        return 14
    raise ValueError(f"Unknown rank: {rank}")

@dataclass(frozen=True)
class Card:
    rank: str
    suit: Optional[str] = None   # Jokers have no suit
    is_joker: bool = False

    def short(self) -> str:
        if self.is_joker:
            return "🃏"
        return f"{self.rank}{self.suit}"

    def is_numeric(self) -> bool:
        return (not self.is_joker) and (self.rank in NUMERIC_RANKS)

    def is_face(self) -> bool:
        return (not self.is_joker) and (self.rank in {"J", "Q", "K"})

    def is_ace(self) -> bool:
        return (not self.is_joker) and (self.rank == "A")

# -----------------------------
# Player + Board
# -----------------------------

@dataclass
class DefenseSlot:
    card: Card
    face_up: bool = False
    destroyed: bool = False

@dataclass
class PendingAceAttack:
    attacker_idx: int
    active: bool = True

@dataclass
class Player:
    name: str
    alive: bool = True

    # King is "in the middle" of their mini-board.
    king_present: bool = True
    king_exposed: bool = False

    # If king is exposed and attacked by an Ace, it stays "pending" until resolved.
    pending_ace: Optional[PendingAceAttack] = None

    defense: List[DefenseSlot] = field(default_factory=list)
    offense: List[Card] = field(default_factory=list)
    jokers: List[Card] = field(default_factory=list)  # separate from 4-card offense hand

# -----------------------------
# Game engine
# -----------------------------

class FortitudeGame:
    def __init__(self, player_names: List[str], seed: Optional[int] = None):
        if seed is not None:
            random.seed(seed)

        self.players: List[Player] = [Player(name=n) for n in player_names]
        self.n = len(self.players)

        # Jokers are set by number of players.
        self.jokers_in_universe = self.n

        # Turn starts left of dealer; for code we just start at 0.
        self.turn_idx = 0

        # Setup each player.
        self._deal_initial()

    # ---- Card generator (WITH replacement) ----

    def draw_card(self) -> Card:
        """
        Draw from a universe consisting of:
          - standard 52-card deck (rank+suit)
          - plus jokers_in_universe jokers
        with replacement.
        """
        total = 52 + self.jokers_in_universe
        x = random.randrange(total)
        if x < self.jokers_in_universe:
            return Card(rank="JOKER", suit=None, is_joker=True)

        # Map remaining to 52 cards
        y = x - self.jokers_in_universe
        rank = RANKS_52[y // 4]
        suit = SUITS[y % 4]
        return Card(rank=rank, suit=suit, is_joker=False)

    # ---- Setup ----

    def _deal_initial(self) -> None:
        for p in self.players:
            # Defense: 4 cards that cannot be Joker, Face, or Ace (numeric only).
            p.defense = []
            while len(p.defense) < 4:
                c = self.draw_card()
                if c.is_joker or c.is_face() or c.is_ace() or (not c.is_numeric()):
                    continue
                p.defense.append(DefenseSlot(card=c, face_up=False, destroyed=False))

            # King card for player exists (not drawn; per "king in the middle" exception).
            p.king_present = True
            p.king_exposed = False

            # Offense: 4 cards may be anything, but Jokers get set aside and replaced.
            p.offense = []
            p.jokers = []
            while len(p.offense) < 4:
                c = self.draw_card()
                if c.is_joker:
                    p.jokers.append(c)
                    continue
                p.offense.append(c)

    # ---- Display helpers ----

    def living_players(self) -> List[int]:
        return [i for i, p in enumerate(self.players) if p.alive]

    def next_living(self, idx: int) -> int:
        alive = self.living_players()
        if len(alive) <= 1:
            return idx
        j = idx
        while True:
            j = (j + 1) % self.n
            if self.players[j].alive:
                return j

    def show_public_board(self) -> None:
        print("\n=== BOARD ===")
        for i, p in enumerate(self.players):
            status = "ALIVE" if p.alive else "OUT"
            k = "K" if p.king_present else "-"
            exposed = "EXPOSED" if p.king_exposed else "HIDDEN"
            pending = ""
            if p.pending_ace and p.pending_ace.active and p.alive:
                pending = f" | 🅰️ pending (attacker: {self.players[p.pending_ace.attacker_idx].name})"

            slots = []
            for ds in p.defense:
                if ds.destroyed:
                    slots.append("[X]")
                else:
                    slots.append(f"[{ds.card.short()}]" if ds.face_up else "[??]")
            print(f"{i}: {p.name} | {status} | King:{k} {exposed} | Def:{' '.join(slots)}{pending}")
        print("=============\n")

    def show_private_hand(self, p: Player) -> None:
        print(f"--- {p.name}'s hand ---")
        print("Offense (4):")
        for idx, c in enumerate(p.offense):
            print(f"  {idx}: {c.short()}")
        print(f"Jokers (side pool): {len(p.jokers)} " + (" ".join(j.short() for j in p.jokers) if p.jokers else ""))
        print("----------------------\n")

    # ---- Rule logic ----

    def refill_offense(self, p: Player) -> None:
        """After playing/discarding, refill to 4 offense cards; jokers drawn are set aside."""
        while len(p.offense) < 4:
            c = self.draw_card()
            if c.is_joker:
                p.jokers.append(c)
            else:
                p.offense.append(c)

    def check_auto_joker_win(self, p: Player) -> bool:
        """If a player has collected ALL jokers in the universe, they instantly win."""
        return len(p.jokers) >= self.jokers_in_universe

    def defense_all_destroyed(self, p: Player) -> bool:
        return all(ds.destroyed for ds in p.defense)

    def update_king_exposure(self, p: Player) -> None:
        if p.alive and p.king_present and self.defense_all_destroyed(p):
            p.king_exposed = True

    # ---- Conversions ----

    def convert_menu(self, p: Player) -> None:
        """
        Implements:
          - pair of any numeric value -> Jack
          - two Jacks -> Queen
          - two Queens -> King
          - two Kings -> Ace
          - Joker + any face (J/Q/K) -> Ace
        """
        while True:
            print("Conversions:")
            print("  1) Pair of numeric cards -> Jack")
            print("  2) Two Jacks -> Queen")
            print("  3) Two Queens -> King")
            print("  4) Two Kings -> Ace")
            print("  5) Joker + Face -> Ace")
            print("  0) Done")
            choice = input("Choose: ").strip()

            if choice == "0":
                return

            if choice == "1":
                # pick two offense indices with same numeric rank
                i = input("Index of first numeric card: ").strip()
                j = input("Index of second numeric card: ").strip()
                if not (i.isdigit() and j.isdigit()):
                    print("Invalid indices.\n")
                    continue
                i, j = int(i), int(j)
                if i == j or not (0 <= i < len(p.offense) and 0 <= j < len(p.offense)):
                    print("Invalid selection.\n")
                    continue
                c1, c2 = p.offense[i], p.offense[j]
                if (not c1.is_numeric()) or (not c2.is_numeric()) or (c1.rank != c2.rank):
                    print("Must be a pair of same-value numeric cards.\n")
                    continue
                # remove higher index first
                for idx in sorted([i, j], reverse=True):
                    p.offense.pop(idx)
                p.offense.append(Card(rank="J", suit="♠"))  # suit doesn't matter in rules
                self.refill_offense(p)
                print("Converted to Jack.\n")
                continue

            if choice == "2":
                # two Jacks -> Queen
                jack_idxs = [idx for idx, c in enumerate(p.offense) if (not c.is_joker and c.rank == "J")]
                if len(jack_idxs) < 2:
                    print("Need two Jacks in offense.\n")
                    continue
                print(f"Jack indices available: {jack_idxs}")
                a = input("Pick first Jack index: ").strip()
                b = input("Pick second Jack index: ").strip()
                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue
                a, b = int(a), int(b)
                if a == b or a not in jack_idxs or b not in jack_idxs:
                    print("Invalid.\n")
                    continue
                for idx in sorted([a, b], reverse=True):
                    p.offense.pop(idx)
                p.offense.append(Card(rank="Q", suit="♠"))
                self.refill_offense(p)
                print("Converted to Queen.\n")
                continue

            if choice == "3":
                # two Queens -> King
                q_idxs = [idx for idx, c in enumerate(p.offense) if (not c.is_joker and c.rank == "Q")]
                if len(q_idxs) < 2:
                    print("Need two Queens in offense.\n")
                    continue
                print(f"Queen indices available: {q_idxs}")
                a = input("Pick first Queen index: ").strip()
                b = input("Pick second Queen index: ").strip()
                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue
                a, b = int(a), int(b)
                if a == b or a not in q_idxs or b not in q_idxs:
                    print("Invalid.\n")
                    continue
                for idx in sorted([a, b], reverse=True):
                    p.offense.pop(idx)
                p.offense.append(Card(rank="K", suit="♠"))
                self.refill_offense(p)
                print("Converted to King.\n")
                continue

            if choice == "4":
                # two Kings -> Ace
                k_idxs = [idx for idx, c in enumerate(p.offense) if (not c.is_joker and c.rank == "K")]
                if len(k_idxs) < 2:
                    print("Need two Kings in offense.\n")
                    continue
                print(f"King indices available: {k_idxs}")
                a = input("Pick first King index: ").strip()
                b = input("Pick second King index: ").strip()
                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue
                a, b = int(a), int(b)
                if a == b or a not in k_idxs or b not in k_idxs:
                    print("Invalid.\n")
                    continue
                for idx in sorted([a, b], reverse=True):
                    p.offense.pop(idx)
                p.offense.append(Card(rank="A", suit="♠"))
                self.refill_offense(p)
                print("Converted to Ace.\n")
                continue

            if choice == "5":
                if not p.jokers:
                    print("No jokers to use.\n")
                    continue
                face_idxs = [idx for idx, c in enumerate(p.offense) if c.is_face()]
                if not face_idxs:
                    print("Need a face card (J/Q/K) in offense.\n")
                    continue
                print(f"Face indices available: {face_idxs}")
                f = input("Pick face index to combine with a joker: ").strip()
                if not f.isdigit():
                    print("Invalid.\n")
                    continue
                f = int(f)
                if f not in face_idxs:
                    print("Invalid.\n")
                    continue
                # consume one joker + that face card
                p.jokers.pop()
                p.offense.pop(f)
                p.offense.append(Card(rank="A", suit="♠"))
                self.refill_offense(p)
                print("Converted Joker + Face -> Ace.\n")
                continue

            print("Unknown choice.\n")

    # ---- Trading (simple + enforce 4-card offense hands) ----

    def trade_menu(self, p_idx: int) -> None:
        """
        Lightweight trading:
          - trade 1-for-1 offense cards
          - trade a joker for a single offense card (or vice versa)
        Enforces each side ends with 4 offense cards (jokers are separate pool).
        """
        p = self.players[p_idx]
        while True:
            print("Trading:")
            print("  1) Trade offense-for-offense (1 card each)")
            print("  2) Trade your joker for their offense card")
            print("  3) Trade your offense card for their joker")
            print("  0) Done")
            choice = input("Choose: ").strip()
            if choice == "0":
                return

            # pick partner
            self.show_public_board()
            t = input("Target player index: ").strip()
            if not t.isdigit():
                print("Invalid.\n")
                continue
            t = int(t)
            if not (0 <= t < self.n) or (not self.players[t].alive) or t == p_idx:
                print("Invalid target.\n")
                continue
            q = self.players[t]

            if choice == "1":
                self.show_private_hand(p)
                self.show_private_hand(q)
                a = input("Your offense index: ").strip()
                b = input("Their offense index: ").strip()
                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue
                a, b = int(a), int(b)
                if not (0 <= a < 4 and 0 <= b < 4):
                    print("Indices must be 0..3.\n")
                    continue
                p.offense[a], q.offense[b] = q.offense[b], p.offense[a]
                print("Traded.\n")
                continue

            if choice == "2":
                if not p.jokers:
                    print("You have no jokers.\n")
                    continue
                self.show_private_hand(q)
                b = input("Their offense index to receive: ").strip()
                if not b.isdigit():
                    print("Invalid.\n")
                    continue
                b = int(b)
                if not (0 <= b < 4):
                    print("Index must be 0..3.\n")
                    continue
                # swap: give joker, receive offense card
                p.jokers.pop()
                p.offense.append(q.offense.pop(b))
                # q draws to refill (since they lost offense)
                self.refill_offense(q)
                # p must go back to 4 offense (since appended makes 5)
                # force them to discard one extra offense of their choice
                while len(p.offense) > 4:
                    self.show_private_hand(p)
                    d = input("You now have 5 offense cards; discard one index: ").strip()
                    if d.isdigit() and 0 <= int(d) < len(p.offense):
                        p.offense.pop(int(d))
                    else:
                        print("Invalid discard.")
                print("Traded joker for offense.\n")
                continue

            if choice == "3":
                if not q.jokers:
                    print("They have no jokers.\n")
                    continue
                self.show_private_hand(p)
                a = input("Your offense index to give: ").strip()
                if not a.isdigit():
                    print("Invalid.\n")
                    continue
                a = int(a)
                if not (0 <= a < 4):
                    print("Index must be 0..3.\n")
                    continue
                # swap: give offense, receive joker
                given = p.offense.pop(a)
                p.jokers.append(q.jokers.pop())
                # p refills offense
                self.refill_offense(p)
                # q must take offense to keep their offense count at 4 (they lost a joker, offense unchanged)
                # so nothing required for q.
                print(f"Gave {given.short()} for a joker.\n")
                continue

            print("Unknown choice.\n")

    # ---- Combat ----

    def choose_attack_card(self, p: Player) -> Tuple[str, Optional[int]]:
        """
        Returns ("offense", idx) or ("joker", idx) or ("cancel", None).
        """
        self.show_private_hand(p)
        print("Choose attack card source:")
        print("  O) Use offense card (index 0..3)")
        print("  J) Use a joker (index in joker list)")
        print("  C) Cancel")
        src = input("Source (O/J/C): ").strip().upper()
        if src == "C":
            return ("cancel", None)
        if src == "O":
            idx = input("Offense index 0..3: ").strip()
            if idx.isdigit() and 0 <= int(idx) < len(p.offense):
                return ("offense", int(idx))
            return ("cancel", None)
        if src == "J":
            if not p.jokers:
                print("No jokers.\n")
                return ("cancel", None)
            idx = input(f"Joker index 0..{len(p.jokers)-1}: ").strip()
            if idx.isdigit() and 0 <= int(idx) < len(p.jokers):
                return ("joker", int(idx))
            return ("cancel", None)
        return ("cancel", None)

    def play_turn(self, p_idx: int) -> Optional[int]:
        """
        Plays a full turn for player p_idx.
        Returns winner index if game ends, else None.
        """
        p = self.players[p_idx]
        if not p.alive:
            return None

        # If you have all jokers in universe, you instantly win.
        if self.check_auto_joker_win(p):
            return p_idx

        # If you have a pending ace on your exposed king, resolve now (must respond by your turn or be out).
        if p.pending_ace and p.pending_ace.active:
            print(f"{p.name}: Your exposed King is under a pending Ace attack from {self.players[p.pending_ace.attacker_idx].name}!")
            resolved = self.resolve_pending_ace(p_idx)
            if not resolved:
                print(f"{p.name} failed to defend. They are OUT.\n")
                p.alive = False
                p.king_present = False
                p.king_exposed = False
                p.pending_ace.active = False
                # Check for game end
                return self.check_game_end()

        # Turn menu
        while True:
            self.show_public_board()
            self.show_private_hand(p)
            print(f"== {p.name}'s turn ==")
            print("1) Trade")
            print("2) Convert cards")
            print("3) Play ONE offensive card (end your turn after)")
            print("0) Forfeit (debug / concede)")
            choice = input("Choose: ").strip()

            if choice == "0":
                p.alive = False
                p.king_present = False
                p.king_exposed = False
                return self.check_game_end()

            if choice == "1":
                self.trade_menu(p_idx)
                if self.check_auto_joker_win(p):
                    return p_idx
                continue

            if choice == "2":
                self.convert_menu(p)
                if self.check_auto_joker_win(p):
                    return p_idx
                continue

            if choice == "3":
                # choose attack card
                src, idx = self.choose_attack_card(p)
                if src == "cancel":
                    print("Canceled.\n")
                    continue

                # target selection
                self.show_public_board()
                t = input("Attack which player index? ").strip()
                if not t.isdigit():
                    print("Invalid.\n")
                    continue
                t = int(t)
                if not (0 <= t < self.n) or (not self.players[t].alive) or t == p_idx:
                    print("Invalid target.\n")
                    continue

                # decide target slot: if king exposed, allow attacking king with Ace; else attack defense slot
                defender = self.players[t]
                self.update_king_exposure(defender)

                card = p.offense[idx] if src == "offense" else p.jokers[idx]

                # Apply restrictions: "An opponent may attack using any offense card ... that is not a joker, face card, or ace."
                # So NORMAL attacks on defense must use numeric cards only.
                if not defender.king_exposed:
                    if card.is_joker or card.is_face() or card.is_ace() or (not card.is_numeric()):
                        print("Illegal: defense attacks must use a numeric offense card (not Joker/Face/Ace).\n")
                        continue
                    # choose defense slot that isn't destroyed
                    live_slots = [i for i, ds in enumerate(defender.defense) if not ds.destroyed]
                    if not live_slots:
                        self.update_king_exposure(defender)
                        print("No defense left; king is exposed.\n")
                        continue
                    print(f"Target defense slot indices: {live_slots}")
                    s = input("Choose defense slot index: ").strip()
                    if not s.isdigit() or int(s) not in live_slots:
                        print("Invalid defense slot.\n")
                        continue
                    s = int(s)

                    # play the attack
                    played = self._consume_card(p, src, idx)
                    self.resolve_defense_attack(attacker_idx=p_idx, defender_idx=t, slot_idx=s, attack_card=played)

                    # refill to 4
                    self.refill_offense(p)

                    # update king exposure after changes
                    self.update_king_exposure(defender)

                    # check end
                    return self.check_game_end()

                else:
                    # King is exposed
                    if card.is_ace():
                        # Attack exposed king with Ace → pending until defender's turn
                        played = self._consume_card(p, src, idx)
                        print(f"{p.name} attacks {defender.name}'s exposed King with {played.short()}!")
                        defender.pending_ace = PendingAceAttack(attacker_idx=p_idx, active=True)

                        self.refill_offense(p)
                        return self.check_game_end()

                    else:
                        print("Illegal: exposed kings can only be attacked with an Ace.\n")
                        continue

            print("Unknown choice.\n")

    def _consume_card(self, p: Player, src: str, idx: int) -> Card:
        if src == "offense":
            return p.offense.pop(idx)
        return p.jokers.pop(idx)

    def resolve_defense_attack(self, attacker_idx: int, defender_idx: int, slot_idx: int, attack_card: Card) -> None:
        attacker = self.players[attacker_idx]
        defender = self.players[defender_idx]
        ds = defender.defense[slot_idx]
        if ds.destroyed:
            print("That defense was already destroyed.\n")
            return

        defense_card = ds.card
        a_val = rank_value(attack_card.rank)
        d_val = rank_value(defense_card.rank)

        print(f"{attacker.name} attacks {defender.name}'s defense with {attack_card.short()} vs {defense_card.short()}.")

        # If offense < defense: offense discarded, defense stays face up
        if a_val < d_val:
            ds.face_up = True
            print("Attack fails: offense < defense. Defense remains (now face up).\n")
            return

        # If offense > defense: both discarded; defense destroyed, king may become exposed
        if a_val > d_val:
            ds.face_up = True
            ds.destroyed = True
            print("Attack succeeds: offense > defense. Defense destroyed.\n")
            self.update_king_exposure(defender)
            return

        # If equal: offense discarded; defender must present an offense card higher value (not Q/K/Joker/A)
        ds.face_up = True
        print("Tie! Defender must respond with a higher-valued offense card (NOT Q/K/Joker/A).")
        resolved = self.resolve_tie_response(defender_idx, a_val)
        if resolved:
            print("Tie defended: defense remains (face up).\n")
        else:
            ds.destroyed = True
            print("Tie failed: defense destroyed.\n")
            self.update_king_exposure(defender)

    def resolve_tie_response(self, defender_idx: int, attack_val: int) -> bool:
        defender = self.players[defender_idx]

        # Jack special rule: "Jack is the only face card usable here; it auto-wins defense."
        # If defender plays a Jack here, they succeed immediately.
        self.show_private_hand(defender)
        print("Tie response options:")
        print("  - Play a numeric offense card with value strictly greater than attacker")
        print("  - OR play a Jack (auto-defend)")
        print("  - You may NOT play Q/K/A/Joker as the higher-card response (Jack is the only allowed face here)")

        while True:
            src = input("Respond with (O)ffense index or (P)ass: ").strip().upper()
            if src == "P":
                return False
            if src != "O":
                print("Invalid.")
                continue
            idx = input("Offense index 0..3: ").strip()
            if not idx.isdigit():
                print("Invalid.")
                continue
            idx = int(idx)
            if not (0 <= idx < len(defender.offense)):
                print("Invalid.")
                continue

            c = defender.offense[idx]
            if c.is_joker or c.rank in {"Q", "K", "A"}:
                print("Illegal response card for tie defense.")
                continue

            # Jack auto-defends
            if c.rank == "J":
                defender.offense.pop(idx)
                self.refill_offense(defender)
                print("Jack played: auto-defended tie (Jack discarded).")
                return True

            # numeric higher
            if c.is_numeric() and rank_value(c.rank) > attack_val:
                defender.offense.pop(idx)
                self.refill_offense(defender)
                print("Higher numeric card played: tie defended (response discarded).")
                return True

            print("That does not satisfy tie-defense requirements.")

    def resolve_pending_ace(self, defender_idx: int) -> bool:
        """
        Defender has an exposed king under pending ace.
        They can:
          - block with a King (discard one King from offense)
          - replace king with Ace (discard an Ace, king remains present)
          - otherwise: they lose and are eliminated
        """
        defender = self.players[defender_idx]
        if not defender.king_exposed or not defender.pending_ace or not defender.pending_ace.active:
            return True

        self.show_private_hand(defender)
        print("Defend against pending Ace:")
        print("  1) Block with a King (discard a King from offense)")
        print("  2) Replace King with an Ace (discard an Ace; King stays)")
        print("  0) Cannot defend")

        choice = input("Choose: ").strip()
        if choice == "1":
            k_idxs = [i for i, c in enumerate(defender.offense) if c.rank == "K"]
            if not k_idxs:
                print("No King to block.\n")
                return False
            print(f"King indices: {k_idxs}")
            i = input("Choose King index: ").strip()
            if i.isdigit() and int(i) in k_idxs:
                defender.offense.pop(int(i))
                self.refill_offense(defender)
                defender.pending_ace.active = False
                print("Ace blocked by King.\n")
                return True
            print("Invalid.\n")
            return False

        if choice == "2":
            a_idxs = [i for i, c in enumerate(defender.offense) if c.rank == "A"]
            if not a_idxs:
                print("No Ace to replace.\n")
                return False
            print(f"Ace indices: {a_idxs}")
            i = input("Choose Ace index: ").strip()
            if i.isdigit() and int(i) in a_idxs:
                defender.offense.pop(int(i))
                self.refill_offense(defender)
                defender.pending_ace.active = False
                # King remains "present" (conceptually replaced). No extra state needed.
                print("King replaced/renewed using Ace.\n")
                return True
            print("Invalid.\n")
            return False

        return False

    # ---- Game end ----

    def check_game_end(self) -> Optional[int]:
        alive = self.living_players()
        if len(alive) == 1:
            return alive[0]
        return None

    def run(self) -> None:
        print("\nFortitude (multiplayer, with replacement)\n")
        while True:
            winner = self.check_game_end()
            if winner is not None:
                print(f"🏆 WINNER: {self.players[winner].name}")
                return

            p_idx = self.turn_idx
            p = self.players[p_idx]
            if p.alive:
                winner = self.play_turn(p_idx)
                if winner is not None:
                    print(f"🏆 WINNER: {self.players[winner].name}")
                    return

            self.turn_idx = self.next_living(self.turn_idx)


# -----------------------------
# Main entrypoint
# -----------------------------

def main():
    print("Fortitude setup")
    n = input("Number of players: ").strip()
    if not n.isdigit() or int(n) < 2:
        print("Need at least 2 players.")
        return
    n = int(n)

    names = []
    for i in range(n):
        nm = input(f"Player {i} name: ").strip()
        names.append(nm if nm else f"P{i}")

    seed_in = input("Optional RNG seed (blank for random): ").strip()
    seed = int(seed_in) if seed_in.isdigit() else None

    game = FortitudeGame(names, seed=seed)
    game.run()

if __name__ == "__main__":
    main()