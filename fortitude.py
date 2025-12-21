import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from wcwidth import wcswidth

# -----------------------------
# Card model + utilities
# -----------------------------

RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["♠", "♥", "♦", "♣"]

NUMERIC_RANKS = set(["2", "3", "4", "5", "6", "7", "8", "9", "10"])

def rank_value(rank: str) -> int:
    """Value for comparisons in attack/defense. Face cards are high, but note: 
    rules restrict what can be played in certain contexts."""
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
            
    def get_player_by_name(self, name: str) -> Optional[int]:
        """
        Resolve a living player by name (case-insensitive).
        Returns player index or None if not found or not alive.
        """
        name = name.strip().lower()
        matches = [
            i for i, p in enumerate(self.players)
            if p.alive and p.name.lower() == name
        ]
        return matches[0] if matches else None

    def show_public_board(self) -> None:
        print("\n╔" + "═" * 64 + "╗")
        print("║{:^64}║".format("BOARD STATE"))
        print("╠" + "═" * 64 + "╣")
        for i, p in enumerate(self.players):
            status = "ALIVE" if p.alive else "OUT"
            k = "K" if p.king_present else "🕱"
            exposed = "EXPOSED" if p.king_exposed else "HIDDEN"
            pending = ""
            if p.pending_ace and p.pending_ace.active and p.alive:
                pending = f" | ⚠️ Ace attack pending"

            slots = []
            for ds in p.defense:
                if ds.destroyed:
                    slots.append("[XX]")
                else:
                    slots.append(f"[{ds.card.short()}]" if ds.face_up else "[??]")
            print(f"║ {p.name} | {status} | King: {k} [{exposed}] | Def:{' '.join(slots)}{pending}")
        print("╚" + "═" * 64 + "╝\n")

    def show_private_hand(self, p: Player) -> None:
        print(f"--- {p.name}'s hand ---")
        print("Offense (4):")
        for i, c in enumerate(p.offense, start=1):
            print(f"  {i}) {c.short()}")
        if p.jokers:
            print(f"Jokers (side pool): {len(p.jokers)} " + " ".join(j.short() for j in p.jokers))
        else:
            print("Jokers (side pool): 0")
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

    def can_add_defense(self, p: Player) -> bool:
        """Returns True if player is allowed to add another defense card."""
        return len(p.defense) < 4

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
            print("  1) Two cards of the same number -> Jack")
            print("  2) Two Jacks -> Queen")
            print("  3) Two Queens -> King")
            print("  4) Two Kings -> Ace")
            print("  5) Joker + Face -> Ace")
            print("  B) Back")
            choice = input("Choose: ").strip()

            if (choice == "B") or (choice == "b"):
                return

            if choice == "1":
                # pick two offense indices with same numeric rank
                self.show_private_hand(p)
                i = input("Choose first card (1–4): ").strip()
                j = input("Choose second card (1–4): ").strip()
                if not (i.isdigit() and j.isdigit()):
                    print("Invalid indices.\n")
                    continue
                i, j = int(i) - 1, int(j) - 1
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

                print(f"Jack positions available: {[i+1 for i in jack_idxs]}")
                a = input("Pick first Jack (1–4): ").strip()
                b = input("Pick second Jack (1–4): ").strip()

                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue

                a, b = int(a) - 1, int(b) - 1
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

                print(f"Queen positions available: {[i+1 for i in q_idxs]}")
                a = input("Pick first Queen (1–4): ").strip()
                b = input("Pick second Queen (1–4): ").strip()

                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue

                a, b = int(a) - 1, int(b) - 1
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

                print(f"King positions available: {[i+1 for i in k_idxs]}")
                a = input("Pick first King (1–4): ").strip()
                b = input("Pick second King (1–4): ").strip()

                if not (a.isdigit() and b.isdigit()):
                    print("Invalid.\n")
                    continue

                a, b = int(a) - 1, int(b) - 1
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

                print(f"Face positions available: {[i+1 for i in face_idxs]}")
                f = input("Pick face card to combine with Joker (1–4): ").strip()

                if not f.isdigit():
                    print("Invalid.\n")
                    continue

                f = int(f) - 1
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

    def trade_transition_back(self, from_player: str, to_player: str) -> None:
        print("\n" + "═" * 44)
        print("        TRADE FINALIZED")
        print("═" * 44 + "\n")
        print(f"{from_player} ➜  {to_player}\n")
        print(f"Please pass control to {to_player}.")
        print("═" * 44 + "\n")


    def trade_menu(self, p_idx: int) -> None:
        """
        Propose a specific-for-specific trade with consent and hidden hands.

        UI:
        - Initiator offers: 1–4 for offense, J for joker, B back
        - Initiator requests: rank (2–10/J/Q/K/A) or JOKER, or B back
        - Target: Y accept, N decline, R review hand (private)

        Notes:
        - Jokers are fungible: when offering or giving a joker, we just take the first one (index 0).
        - No hand is revealed unless the reviewing player chooses to view their own.
        """
        p = self.players[p_idx]
        valid_ranks = set(RANKS_52)

        while True:
            print("Trading:")
            print("  1) Propose a trade")
            print("  B) Back")
            top = input("Choose: ").strip().upper()

            if top == "B":
                return
            if top != "1":
                print("Invalid.\n")
                continue

           # --- pick partner ---
            self.show_public_board()

            name = input("Propose trade to which player (name)? ").strip()

            # build lookup of alive players by name (case-insensitive)
            name_map = {pl.name.lower(): i for i, pl in enumerate(self.players) if pl.alive}

            if name.lower() not in name_map:
                print("Invalid target.\n")
                continue

            t = name_map[name.lower()]
            if t == p_idx:
                print("You cannot trade with yourself.\n")
                continue

            q = self.players[t]

            # --- OFFER: pick a specific card you control ---
            offer_kind = None
            offered_card = None

            while True:
                print("Select a card to OFFER:")

                for i, c in enumerate(p.offense, start=1):
                    print(f"  {i}) {c.short()}")

                if p.jokers:
                    print("  J) Joker")
                print("  B) Back")

                pick = input("Choose: ").strip().upper()

                if pick == "B":
                    print("Trade canceled.\n")
                    offer_kind = None
                    break

                if pick == "J":
                    if not p.jokers:
                        print("You have no jokers.\n")
                        continue
                    offer_kind = ("joker", 0)      # jokers are fungible
                    offered_card = p.jokers[0]
                    break

                if pick.isdigit():
                    k = int(pick)
                    if 1 <= k <= len(p.offense):
                        idx = k - 1
                        offer_kind = ("offense", idx)
                        offered_card = p.offense[idx]
                        break

                print("Invalid choice.\n")

            if offer_kind is None:
                continue  # back to Trading menu

            # --- REQUEST: specify what you want ---
            print("\nWhat do you REQUEST?")
            print("  Rank: 2–10, J, Q, K, A")
            print("  Or: JOKER")
            print("  B) Back")
            req = input("Request: ").strip().upper()

            if req == "B":
                print("Trade canceled.\n")
                continue

            if req == "1":
                req = "A"

            if req != "JOKER" and req not in valid_ranks:
                print("Invalid request.\n")
                continue

            # --- CONSENT ---
            print("\n" + "═" * 44)
            print("        TRADE UNDER CONSIDERATION")
            print("═" * 44 + "\n")
            print(f"{p.name} ➜  {q.name}\n")
            print(f"Please pass control to {q.name}.")
            print("Other players should look away.\n")
            print("═" * 44)

            print(f"\n{q.name}, there is a trade proposal from {p.name}:")
            print(f"  Offer: {offered_card.short()}")
            print(f"  Request: {'🃏 Joker' if req == 'JOKER' else req}")

            consent = False
            while True:
                print("\nConfirm trade:")
                print("  Y) Accept")
                print("  N) Decline")
                print("  R) Review your hand")
                resp = input("Choose: ").strip().upper()

                if resp == "R":
                    self.show_private_hand(q)
                    continue
                if resp == "N":
                    consent = False
                    break
                if resp == "Y":
                    consent = True
                    break
                print("Invalid choice.\n")

            if not consent:
                print("Trade declined.\n")
                self.trade_transition_back(q.name, p.name)
                continue

            # --- TARGET privately selects matching card to give ---
            received_card = None
            received_kind = None

            if req == "JOKER":
                if not q.jokers:
                    print("Trade fails: they have no joker.\n")
                    self.trade_transition_back(q.name, p.name)
                    continue
                received_card = q.jokers[0]
                received_kind = ("joker", 0)

            else:
                matches = [i for i, c in enumerate(q.offense) if c.rank == req]
                if not matches:
                    print("Trade fails: they have no matching card.\n")
                    self.trade_transition_back(q.name, p.name)
                    continue

                while True:
                    self.show_private_hand(q)
                    print(f"Select a card to complete the trade ({req}):")
                    for i in matches:
                        print(f"  {i+1}) {q.offense[i].short()}")
                    print("  B) Back (cancel trade)")

                    sel = input("Choose: ").strip().upper()
                    if sel == "B":
                        print("Trade canceled.\n")
                        self.trade_transition_back(q.name, p.name)
                        received_card = None
                        break
                    if sel.isdigit():
                        k = int(sel) - 1
                        if k in matches:
                            received_card = q.offense[k]
                            received_kind = ("offense", k)
                            break
                    print("Invalid selection.\n")

                if received_card is None:
                    continue

            # --- EXECUTE SWAP ---
            # remove offered from p
            if offer_kind[0] == "offense":
                p.offense.pop(offer_kind[1])
            else:
                p.jokers.pop(0)

            # remove received from q
            if received_kind[0] == "offense":
                q.offense.pop(received_kind[1])
            else:
                q.jokers.pop(0)

            # give offered to q
            if offer_kind[0] == "offense":
                q.offense.append(offered_card)
            else:
                q.jokers.append(offered_card)

            # give received to p
            if received_kind[0] == "offense":
                p.offense.append(received_card)
            else:
                p.jokers.append(received_card)

            # refill offense hands
            self.refill_offense(p)
            self.refill_offense(q)

            print("Trade completed.\n")
            self.trade_transition_back(q.name, p.name)

    # ---- Combat ----

    def choose_attack_card(self, p: Player) -> Tuple[str, Optional[int]]:
        """
        UI-driven offense selection.

        Displays offense cards numbered 1–4.
        Player selects:
        - 1–4 to choose an offense card
        - B to cancel / go back

        Returns:
        ("offense", idx)  where idx is 0-based
        ("cancel", None)
        """
        while True:
            self.show_private_hand(p)
            print("Select an offense card to play:")

            for i, c in enumerate(p.offense, start=1):
                print(f"  {i}) {c.short()}")

            print("  B) Back")

            choice = input("Choose: ").strip().upper()

            if choice == "B":
                return ("cancel", None)

            if choice.isdigit():
                pick = int(choice)
                if 1 <= pick <= len(p.offense):
                    return ("offense", pick - 1)

            print("Invalid selection.\n")

    def add_defense_card(self, p: Player) -> bool:
        """
        Adds a new face-down numeric defense card to the player.
        Returns True if successful, False if at max defense.
        """
        if not self.can_add_defense(p):
            return False

        while True:
            c = self.draw_card()
            if c.is_numeric():
                p.defense.append(DefenseSlot(card=c, face_up=False, destroyed=False))
                return True

    def play_turn(self, p_idx: int) -> Optional[int]:
        """
        Plays a full turn for player p_idx.
        Returns winner index if game ends, else None.
        """
        p = self.players[p_idx]
        if not p.alive:
            return None
        
        print("\n" + "=" * 60)
        print(f"▶▶▶  {p.name.upper()}'S TURN")
        print("=" * 60 + "\n")

        # If you have all jokers in universe, you instantly win.
        if self.check_auto_joker_win(p):
            print(f"{p.name} has all the Jokers!")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            print("🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣")
            return p_idx

        # If you have a pending ace on your exposed king, resolve now (must respond by your turn or be out).
        if p.pending_ace and p.pending_ace.active:
            print(f"{p.name}: ⚠️ Your exposed King is under a pending Ace attack from {self.players[p.pending_ace.attacker_idx].name}!")
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
            print("1) Trade cards")
            print("2) Convert cards")
            print("3) Play ONE offensive card (end turn after)")
            print("F) Forfeit")
            choice = input("Choose: ").strip()

            if (choice == "F") or (choice == "f"):
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

                # target selection by name
                self.show_public_board()
                name = input("Attack which player? (type name): ").strip()
                # build lookup of alive opponents
                name_map = {
                    p.name.lower(): i
                    for i, p in enumerate(self.players)
                    if p.alive and i != p_idx
                }
                t = name_map.get(name.lower())
                if t is None:
                    print("Invalid target. Choose a living opponent by name.\n")
                    continue

                # decide target slot: if king exposed, allow attacking king with Ace; else attack defense slot
                defender = self.players[t]
                self.update_king_exposure(defender)

                card = p.offense[idx] if src == "offense" else p.jokers[idx]

                # ---- QUEEN: add a defense card ----
                if src == "offense" and card.rank == "Q":

                    # Check for defense of 4
                    if not self.can_add_defense(p):
                        print("Illegal move: you already have the maximum of 4 defense cards.\n")
                        continue
                
                    # consume the Queen
                    p.offense.pop(idx)

                    print(f"{p.name} plays a Queen to reinforce their defenses.")

                    # add a new defense card
                    self.add_defense_card(p)

                    # refill offense hand
                    self.refill_offense(p)

                    # playing a Queen ends the turn (it is the offensive action)
                    return self.check_game_end()

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

                    print(f"Target defense slots available: {[i+1 for i in live_slots]}")
                    s = input("Choose defense slot (1–4): ").strip()

                    if not s.isdigit():
                        print("Invalid defense slot.\n")
                        continue

                    s = int(s) - 1
                    if s not in live_slots:
                        print("Invalid defense slot.\n")
                        continue

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
        print("  - You may NOT play Q/K/A/Joker")

        while True:
            choice = input("Choose card (1–4) or P to pass: ").strip().upper()

            if choice == "P":
                return False

            if not choice.isdigit():
                print("Invalid.")
                continue

            idx = int(choice) - 1
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

            print("That does not satisfy tie-defense requirements. Defense failed.")


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
        print("  K) Block with a King (discard a King from offense)")
        print("  A) Replace King with an Ace (discard an Ace; King stays)")
        print("  C) Cannot defend")

        choice = input("Choose: ").strip()
        if choice == "K":
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

        if choice == "A":
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

    # ---- Game intro ----
    def show_intro(self):
        print(r"""
        ███████╗ ██████╗ ██████╗ ████████╗██╗████████╗██╗   ██╗██████╗ ███████╗
        ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝
        █████╗  ██║   ██║██████╔╝   ██║   ██║   ██║   ██║   ██║██║  ██║█████╗
        ██╔══╝  ██║   ██║██╔══██╗   ██║   ██║   ██║   ██║   ██║██║  ██║██╔══╝
        ██║     ╚██████╔╝██║  ██║   ██║   ██║   ██║   ╚██████╔╝██████╔╝███████╗
        ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝   ╚═╝    ╚═════╝ ╚═════╝ ╚══════╝
        """)
            
    def show_instructions(self):
        print("""
        FORTITUDE
        A multiplayer strategy card game of kings, chance, bargaining, and nerve.

        OBJECTIVE
        ---------
        Be the last player with a living King.

        Alternate win condition:
        A player who collects ALL Jokers in the game immediately wins.

        COMPONENTS
        ----------
        - Conceptual standard 52-card deck (cards are drawn WITH replacement)
        - Jokers: exactly one Joker per player
        - 2–6 players recommended

        CARD TYPES
        ----------
        Numeric Cards:
        - Ranks 2–10
        - Used for defense and most attacks
        - Higher value defeats lower value

        Face Cards:
        - Jack (J): special defensive utility in tie situations
        - Queen (Q): defense regeneration via conversion
        - King (K): blocks Ace attacks or converts upward
        - Ace (A): executes or renews Kings

        Jokers:
        - Tracked separately from offense hand
        - Used in conversions, trading, and as an alternate win condition

        SETUP
        -----
        Each player begins with:
        - 1 King placed at the center of their board
        - 4 Defense cards (numeric only), placed face down
        - 4 Offense cards (any rank)
        - Jokers drawn into offense are set aside and replaced

        Defense cards may not be Jokers, Face cards, or Aces.

        TURN STRUCTURE
        --------------
        On your turn, in order, you may:
        1) Trade cards (optional, repeatable)
        2) Convert cards (optional, repeatable)
        3) Play exactly ONE offensive card
        4) Refill offense hand to 4 cards

        Your turn ends immediately after playing an offensive card.

        TRADING
        -------
        - Trading is voluntary and unrestricted
        - Any number of trades per turn
        - Legal trades:
            * Offense-for-offense (1-for-1)
            * Joker-for-offense
            * Offense-for-joker
        - All players must end with exactly 4 offense cards
        - Jokers do not count toward offense size

        CARD CONVERSIONS
        ----------------
        Conversions may occur at any time during your turn before attacking.

        Legal conversions:
        - Two identical numeric cards -> Jack
        - Two Jacks -> Queen
        - Two Queens -> King
        - Two Kings -> Ace
        - Joker + any face card (J/Q/K) -> Ace

        Converted cards are discarded; the resulting card enters offense.
        Players must still maintain exactly 4 offense cards.

        ATTACKING DEFENSES
        ------------------
        You may attack ONE defense card of another player per turn.

        Valid attack cards:
        - Numeric cards ONLY
        - Jokers, Face cards, and Aces may NOT attack defenses

        Attack resolution:
        Let A = attack value, D = defense value

        - If A < D:
            Attack fails; offense card is discarded.
            Defense remains and is flipped face up.

        - If A > D:
            Attack succeeds; both cards are discarded.
            Defense is destroyed.

        - If A == D (tie):
            Attack card is discarded.
            Defense flips face up.
            Defender must immediately respond.

        TIE DEFENSE
        -----------
        To defend a tie, the defender must play ONE offense card:

        Valid responses:
        - A numeric card with value strictly greater than the attacker
        - OR a Jack (auto-defends regardless of value)

        Illegal responses:
        - Queens, Kings, Aces, Jokers

        Response cards are always discarded.

        If the defender fails or passes, the defense is destroyed.

        KING EXPOSURE
        -------------
        A King becomes exposed when ALL four defenses are destroyed.

        Exposed Kings:
        - May ONLY be attacked with an Ace
        - Cannot be attacked by any other card

        ACE ATTACKS (KING EXECUTION)
        ----------------------------
        When an exposed King is attacked with an Ace:
        - The Ace becomes pending
        - The defending player is not eliminated immediately
        - The defender must respond by their next turn

        DEFENDING A PENDING ACE
        -----------------------
        On their next turn, the defending player must choose ONE:

        1) Block with a King:
            Discard one King from offense.
            The Ace is neutralized.

        2) Replace the King with an Ace:
            Discard one Ace from offense.
            The King remains in play (renewed).

        3) Fail to defend:
            The player is eliminated.

        Failure to respond results in elimination.

        JOKERS
        ------
        - Jokers are drawn separately from offense
        - Jokers may be traded freely
        - Jokers may be used in conversions
        - Collecting ALL Jokers in the game results in an immediate win

        This condition overrides all others, including pending Ace attacks.

        ELIMINATION
        -----------
        A player is eliminated if:
        - Their exposed King is successfully executed by an Ace
        - They fail to defend against a pending Ace
        - They voluntarily concede

        Eliminated players are removed from turn order.

        WINNING
        -------
        The game ends immediately when:
        - Only one player remains alive
        - OR a player holds all Jokers in the game
        """)



# -----------------------------
# Main entrypoint
# -----------------------------

def main():
    menu_game = FortitudeGame([])

    menu_game.show_intro()

    while True:
        print("1) Start game")
        print("2) View instructions")
        print("Q) Quit")
        choice = input("Choose: ").strip()

        if choice == "2":
            menu_game.show_instructions()
            input("\nPress Enter to return to menu...")
        elif choice == "1":
            break
        elif choice == "Q":
            return
        else:
            print("Invalid choice.\n")

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

    seed_in = input("Optional RNG seed (hit enter for random): ").strip()
    seed = int(seed_in) if seed_in.isdigit() else None

    game = FortitudeGame(names, seed=seed)
    game.run()


if __name__ == "__main__":
    main()