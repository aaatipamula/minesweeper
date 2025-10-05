import type { Cell } from "@/_util/grid";
import {
  cloneBoard,
  floodFill,
  placeMines,
  computeAdjacency,
} from "@/_util/grid";

type Ctx = {
  board: Cell[][];
  gridSize: number;
  mines: number;
  started: boolean;
  setBoard: (b: Cell[][]) => void;
  setStarted: (v: boolean) => void;
  setFlagsLeft: (n: number) => void;
  setGameOver: (s: null | "lost" | "won") => void;
  checkWin: (b: Cell[][]) => boolean;
  revealMines: () => void;
};

/**
 * Easy AI (one move):
 * - Picks a random hidden, unflagged cell and opens it.
 * - If it’s the very first move, it also triggers mine placement (first-click safety).
 * - If it hits a mine, it immediately loses.
 * - Otherwise it flood-fills like the player would.
 */
export function easyAi(ctx?: Ctx) {
  if (!ctx) { 
    console.warn("easyAi called without ctx"); 
    return; 
  }

  const {
    board, gridSize, mines, started,
    setBoard, setStarted, setGameOver,
    checkWin, revealMines
  } = ctx;

  const next = cloneBoard(board);

  // Collect all cells that are still hidden and not flagged.
  const candidates: Array<[number, number]> = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = next[r][c];
      if (!cell.revealed && !cell.flagged) {
        candidates.push([r, c]);
      }
    }
  }

  // Nothing left to click? Bail out.
  if (candidates.length === 0) return;

  // Pick one random candidate.
  const [rr, cc] = candidates[Math.floor(Math.random() * candidates.length)];
  const target = next[rr][cc];

  // First click special case: place mines *after* choosing this cell
  // so we guarantee the AI (or player) never loses immediately.
  if (!started) {
    placeMines(next, mines, { r: rr, c: cc });
    computeAdjacency(next);
    setStarted(true);
  }

  // If the chosen cell is a mine → game over
  if (target.isMine) {
    target.revealed = true;
    setBoard(next);
    setGameOver("lost");
    revealMines();
    console.log(`Easy AI hit a mine at (${rr},${cc})`);
    return;
  }

  // Otherwise, flood-fill reveal (handles zeros + connected safe area).
  floodFill(next, gridSize, rr, cc);
  setBoard(next);

  // After the move, check if this wins the game.
  if (checkWin(next)) {
    setGameOver("won");
    revealMines();
    console.log("Easy AI: game won!");
  } else {
    console.log(`Easy AI opened at (${rr},${cc})`);
  }
}

/**
 * Medium AI (one move):
 * - Tries to make a logical move first.
 * - Always reveals at least one tile on its turn (so interactive mode feels fair).
 * - If logic is stuck, it guesses. If literally only flags remain, it unflags one and opens it.
 */
export function mediumAi(ctx?: Ctx) {
  if (!ctx) { console.warn("mediumAi called without ctx"); return; }

  const {
    board, gridSize, mines, started,
    setBoard, setStarted, setFlagsLeft, setGameOver,
    checkWin, revealMines
  } = ctx;

  const next = cloneBoard(board);

  // Small helpers to juggle coordinate sets
  const enc = (r: number, c: number) => `${r},${c}`;
  const dec = (s: string) => s.split(",").map(Number) as [number, number];
  const dirs = [-1, 0, 1];

  let didOpen = false;
  let didFlag = false;

  // Buckets we’ll fill, then apply once.
  const toFlag = new Set<string>();      // Rule 1 results
  const toOpenRule = new Set<string>();  // Rule 2 results
  const toOpenZero = new Set<string>();  // neighbors of revealed 0s (safe)

  // Scan: neighbors of revealed 0s are safe -> open them (good for building frontier)
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = next[r][c];
      if (!cell.revealed || cell.adjacent !== 0) continue;

      for (const dr of dirs) for (const dc of dirs) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const n = next[nr][nc];
        if (!n.revealed && !n.flagged) toOpenZero.add(enc(nr, nc));
      }
    }
  }

  // Scan: apply the two classic rules around revealed numbers
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = next[r][c];
      if (!cell.revealed || cell.adjacent <= 0) continue;

      const hidden: Array<[number, number]> = [];
      let flagged = 0;

      for (const dr of dirs) for (const dc of dirs) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const n = next[nr][nc];
        if (n.flagged) flagged++;
        if (!n.revealed && !n.flagged) hidden.push([nr, nc]);
      }

      // Rule 1: all remaining hidden must be mines → flag them
      if (hidden.length === cell.adjacent - flagged && hidden.length > 0) {
        for (const [hr, hc] of hidden) toFlag.add(enc(hr, hc));
      }

      // Rule 2: all remaining hidden must be safe → open them
      if (flagged === cell.adjacent && hidden.length > 0) {
        for (const [hr, hc] of hidden) toOpenRule.add(enc(hr, hc));
      }
    }
  }

  // Apply flags first (doesn't count as the "turn" by itself)
  for (const [r, c] of Array.from(toFlag, dec)) {
    const cell = next[r][c];
    if (!cell.revealed && !cell.flagged) {
      cell.flagged = true;
      didFlag = true;
    }
  }
  if (toFlag.size > 0) {
    const placed = next.flat().filter(c => c.flagged).length;
    setFlagsLeft(Math.max(0, mines - placed));
  }

  // Helper to open exactly one cell from a set (so the AI only "clicks" once per turn)
  const openOne = (bucket: Set<string>, label: string) => {
    for (const [r, c] of Array.from(bucket, dec)) {
      const cell = next[r][c];
      if (cell.revealed || cell.flagged) continue;

      if (cell.isMine) {
        // Shouldn't happen for rule-based sets, but be safe.
        cell.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        console.log(`Medium AI (${label}) mis-opened a mine at (${r},${c})`);
        return true;
      }

      floodFill(next, gridSize, r, c);
      didOpen = true;
      console.log(`Medium AI opened (${r},${c}) via ${label}`);
      return true;
    }
    return false;
  };

  // After flagging, new Rule 2 opens might appear. Quick pass to find one to click.
  if (!didOpen) {
    const r2 = new Set<string>();
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (!cell.revealed || cell.adjacent <= 0) continue;

        const hidden: Array<[number, number]> = [];
        let flagged = 0;
        for (const dr of dirs) for (const dc of dirs) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
          const n = next[nr][nc];
          if (n.flagged) flagged++;
          if (!n.revealed && !n.flagged) hidden.push([nr, nc]);
        }
        if (flagged === cell.adjacent && hidden.length > 0) {
          for (const [hr, hc] of hidden) r2.add(enc(hr, hc));
        }
      }
    }
    if (openOne(r2, "Rule 2 (post-flag)")) {
      setBoard(next);
      if (checkWin(next)) { setGameOver("won"); revealMines(); }
      return;
    }
  }

  // Try one rule-based or zero-neighbor open
  if (!didOpen && openOne(toOpenRule, "Rule 2")) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
    return;
  }
  if (!didOpen && openOne(toOpenZero, "zero-adjacent")) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
    return;
  }

  // If no logic move, guess a hidden, unflagged cell
  if (!didOpen) {
    const candidates: Array<[number, number]> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (!cell.revealed && !cell.flagged) candidates.push([r, c]);
      }
    }

    if (candidates.length > 0) {
      const [rr, cc] = candidates[Math.floor(Math.random() * candidates.length)];
      console.log(`Medium AI random at (${rr},${cc})`);

      // Standard first-click safety
      if (!started) {
        placeMines(next, mines, { r: rr, c: cc });
        computeAdjacency(next);
        setStarted(true);
      }

      const target = next[rr][cc];
      if (target.isMine) {
        target.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        console.log(`Medium AI random hit mine at (${rr},${cc})`);
        return;
      } else {
        floodFill(next, gridSize, rr, cc);
        didOpen = true;
      }

      setBoard(next);
      if (checkWin(next)) { setGameOver("won"); revealMines(); }
      return;
    }
  }

  // Last resort: everything left is flagged -> unflag one and open it so we finish.
  if (!didOpen) {
    const flaggedCovered: Array<[number, number]> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (cell.flagged && !cell.revealed) flaggedCovered.push([r, c]);
      }
    }
    if (flaggedCovered.length > 0) {
      const [rr, cc] = flaggedCovered[Math.floor(Math.random() * flaggedCovered.length)];
      console.log(`Medium AI last-resort: unflag + open (${rr},${cc})`);
      next[rr][cc].flagged = false;

      const placed = next.flat().filter(c => c.flagged).length;
      setFlagsLeft(Math.max(0, mines - placed));

      const target = next[rr][cc];
      if (target.isMine) {
        target.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        return;
      } else {
        floodFill(next, gridSize, rr, cc);
        didOpen = true;
        setBoard(next);
        if (checkWin(next)) { setGameOver("won"); revealMines(); }
        return;
      }
    }
  }

  // If we only placed flags, still commit the board (UI feedback).
  if (didFlag) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
  }
}


export function hardAi(ctx?: Ctx) {
  if (!ctx) { console.warn("hardAi called without ctx"); return; }

  const {
    board, gridSize, mines, started,
    setBoard, setStarted, setFlagsLeft, setGameOver,
    checkWin, revealMines
  } = ctx;

  // Work on a cloned board to avoid mutating React state directly.
  const next = cloneBoard(board);

  // First-click safety
  // place mines excluding a chosen cell and reveal it.
  if (!started) {
    const candidates: Array<[number, number]> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (!cell.revealed && !cell.flagged) candidates.push([r, c]);
      }
    }

    if (candidates.length > 0) {
      const [rr, cc] = candidates[Math.floor(Math.random() * candidates.length)];

      // Place mines excluding the chosen cell and compute adjacents
      placeMines(next, mines, { r: rr, c: cc });
      computeAdjacency(next);
      setStarted(true);

      const target = next[rr][cc];
      // Rare: if something went wrong and it's a mine, handle loss
      if (target.isMine) {
        target.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        console.log(`Hard AI first-click safety unexpectedly hit mine at (${rr},${cc})`);
        return;
      }

      // Reveal the chosen safe cell and commit the board
      floodFill(next, gridSize, rr, cc);
      setBoard(next);
      if (checkWin(next)) { setGameOver("won"); revealMines(); }
      console.log(`Hard AI random opened safe (${rr},${cc})`);
      return;
    }
  }

  // Helpers (same as mediumAi)
  const enc = (r: number, c: number) => `${r},${c}`;
  const dec = (s: string) => s.split(",").map(Number) as [number, number];
  const dirs = [-1, 0, 1];

  let didOpen = false;
  let didFlag = false;

  // Buckets
  const toFlag = new Set<string>();      // Rule 1 / 1-2-1 results
  const toOpenRule = new Set<string>();  // Rule 2 results
  const toOpenZero = new Set<string>();  // neighbors of revealed 0s (safe)

  // ********************************************************
  // Step 1: Zero-neighbor expansion
  // ********************************************************
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = next[r][c];
      if (!cell.revealed || cell.adjacent !== 0) continue;

      for (const dr of dirs) for (const dc of dirs) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const n = next[nr][nc];
        if (!n.revealed && !n.flagged) toOpenZero.add(enc(nr, nc));
      }
    }
  }

  // ********************************************************
  // Step 2: Rule 1 & 2 scans (same logic as medium)
  // ********************************************************
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = next[r][c];
      if (!cell.revealed || cell.adjacent <= 0) continue;

      const hidden: Array<[number, number]> = [];
      let flagged = 0;

      for (const dr of dirs) for (const dc of dirs) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const n = next[nr][nc];
        if (n.flagged) flagged++;
        if (!n.revealed && !n.flagged) hidden.push([nr, nc]);
      }

      // Rule 1: if hidden count equals remaining mines, flag them
      if (hidden.length === cell.adjacent - flagged && hidden.length > 0) {
        for (const [hr, hc] of hidden) toFlag.add(enc(hr, hc));
      }

      // Rule 2: if flagged equals adjacency, remaining hidden are safe
      if (flagged === cell.adjacent && hidden.length > 0) {
        for (const [hr, hc] of hidden) toOpenRule.add(enc(hr, hc));
      }
    }
  }

  // ********************************************************
  // Step 3: 1-2-1 pattern detection (hard-specific rule)
  // Detect horizontal and vertical 1-2-1 patterns and flag center neighbors
  // ********************************************************
  // Helper: gather neighbors of a cell as a set of coords
  const neighborsSet = (r: number, c: number) => {
    const s = new Set<string>();
    for (const dr of dirs) for (const dc of dirs) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
      s.add(enc(nr, nc));
    }
    return s;
  };

  // Horizontal 1-2-1
  for (let r = 0; r < gridSize; r++) {
    for (let c = 1; c < gridSize - 1; c++) {
      const left = next[r][c - 1], center = next[r][c], right = next[r][c + 1];
      if (!left.revealed || !center.revealed || !right.revealed) continue;
      if (left.adjacent === 1 && center.adjacent === 2 && right.adjacent === 1) {
        // Compute neighbors exclusive to center (neighbors of center minus neighbors of left and right)
        const centerN = neighborsSet(r, c);
        const leftN = neighborsSet(r, c - 1);
        const rightN = neighborsSet(r, c + 1);

        // Remove neighbors in left or right neighbor sets (we want center-exclusive)
        for (const x of leftN) centerN.delete(x);
        for (const x of rightN) centerN.delete(x);

        // From remaining center-exclusive neighbors, keep only hidden & unflagged ones
        const exclusives = Array.from(centerN).filter(s => {
          const [nr, nc] = dec(s);
          const cell = next[nr][nc];
          return !cell.revealed && !cell.flagged;
        });

        // If it's the 1-2-1 case where two exclusives exist, flag the mines
        if (exclusives.length === 2) {
          for (const s of exclusives) toFlag.add(s);
        }
      }
    }
  }

  // Vertical 1-2-1
  for (let r = 1; r < gridSize - 1; r++) {
    for (let c = 0; c < gridSize; c++) {
      const up = next[r - 1][c], center = next[r][c], down = next[r + 1][c];
      if (!up.revealed || !center.revealed || !down.revealed) continue;
      if (up.adjacent === 1 && center.adjacent === 2 && down.adjacent === 1) {
        const centerN = neighborsSet(r, c);
        const upN = neighborsSet(r - 1, c);
        const downN = neighborsSet(r + 1, c);

        for (const x of upN) centerN.delete(x);
        for (const x of downN) centerN.delete(x);

        const exclusives = Array.from(centerN).filter(s => {
          const [nr, nc] = dec(s);
          const cell = next[nr][nc];
          return !cell.revealed && !cell.flagged;
        });

        if (exclusives.length === 2) {
          for (const s of exclusives) toFlag.add(s);
        }
      }
    }
  }

  // ********************************************************
  // Step 4: Apply flagged deductions (rule 1 & 1-2-1)
  // ********************************************************
  for (const [r, c] of Array.from(toFlag, dec)) {
    const cell = next[r][c];
    if (!cell.revealed && !cell.flagged) {
      cell.flagged = true;
      didFlag = true;
    }
  }
  if (toFlag.size > 0) {
    const placed = next.flat().filter(c => c.flagged).length;
    setFlagsLeft(Math.max(0, mines - placed));
  }

  // ********************************************************
  // Helper: Open exactly one cell from a bucket (one click per turn)
  // ********************************************************
  const openOne = (bucket: Set<string>, label: string) => {
    for (const [r, c] of Array.from(bucket, dec)) {
      const cell = next[r][c];
      if (cell.revealed || cell.flagged) continue;

      // Shouldn't happen: if this happens to be a mine, handle loss
      if (cell.isMine) {
        cell.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        console.log(`Hard AI (${label}) mis-opened a mine at (${r},${c})`);
        return true;
      }

      // Normal safe open
      floodFill(next, gridSize, r, c);
      didOpen = true;
      console.log(`Hard AI opened (${r},${c}) via ${label}`);
      return true;
    }
    return false;
  };

  // ********************************************************
  // Step 5: Quick Rule 2 pass (like medium), try to open one safe cell
  // ********************************************************
  if (!didOpen) {
    const r2 = new Set<string>();
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (!cell.revealed || cell.adjacent <= 0) continue;

        const hidden: Array<[number, number]> = [];
        let flagged = 0;
        for (const dr of dirs) for (const dc of dirs) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
          const n = next[nr][nc];
          if (n.flagged) flagged++;
          if (!n.revealed && !n.flagged) hidden.push([nr, nc]);
        }
        if (flagged === cell.adjacent && hidden.length > 0) {
          for (const [hr, hc] of hidden) r2.add(enc(hr, hc));
        }
      }
    }
    if (openOne(r2, "Rule 2 (post-flag)")) {
      setBoard(next);
      if (checkWin(next)) { setGameOver("won"); revealMines(); }
      return;
    }
  }

  // ********************************************************
  // Step 6: Safe open fallback: repeat rule 2 then zero-neighborss
  // ********************************************************
  if (!didOpen && openOne(toOpenRule, "Rule 2")) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
    return;
  }
  if (!didOpen && openOne(toOpenZero, "zero-adjacent")) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
    return;
  }

  // ********************************************************
  // Phase 7: Cheat fallback: open a guaranteed-safe (non-mine) unrevealed cell
  // ********************************************************
  if (!didOpen) {
    // If game hasn't started, do first-click safety: pick a random candidate and place mines after picking
    if (!started) {
      // Collect hidden & unflagged candidates
      const candidates: Array<[number, number]> = [];
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const cell = next[r][c];
          if (!cell.revealed && !cell.flagged) candidates.push([r, c]);
        }
      }

      if (candidates.length > 0) {
        const [rr, cc] = candidates[Math.floor(Math.random() * candidates.length)];
        // Place mines excluding this chosen cell to guarantee safety
        placeMines(next, mines, { r: rr, c: cc });
        computeAdjacency(next);
        setStarted(true);

        const target = next[rr][cc];
        if (target.isMine) {
          // Very unlikely: if mines placement misbehaved
          target.revealed = true;
          setBoard(next);
          setGameOver("lost");
          revealMines();
          console.log(`Hard AI (cheat-first) unexpectedly hit mine at (${rr},${cc})`);
          return;
        }

        floodFill(next, gridSize, rr, cc);
        didOpen = true;
        setBoard(next);
        if (checkWin(next)) { setGameOver("won"); revealMines(); }
        console.log(`Hard AI (cheat-first) opened safe (${rr},${cc})`);
        return;
      }
    } else {
      // Game started and mines placed: find any unrevealed, unflagged cell that is non-mine
      const safeCandidates: Array<[number, number]> = [];
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const cell = next[r][c];
          if (!cell.revealed && !cell.flagged && cell.isMine === false) {
            safeCandidates.push([r, c]);
          }
        }
      }

      if (safeCandidates.length > 0) {
        const [rr, cc] = safeCandidates[Math.floor(Math.random() * safeCandidates.length)];
        floodFill(next, gridSize, rr, cc);
        didOpen = true;
        setBoard(next);
        if (checkWin(next)) { setGameOver("won"); revealMines(); }
        console.log(`Hard AI (cheat) opened known-safe (${rr},${cc})`);
        return;
      }
    }
  }

  // ********************************************************
  // Step 8: If still stuck, fall back to medium's guessing behavior (should be rare)
  // ********************************************************
  if (!didOpen) {
    const candidates: Array<[number, number]> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (!cell.revealed && !cell.flagged) candidates.push([r, c]);
      }
    }

    if (candidates.length > 0) {
      const [rr, cc] = candidates[Math.floor(Math.random() * candidates.length)];
      console.log(`Hard AI fallback random at (${rr},${cc})`);

      if (!started) {
        placeMines(next, mines, { r: rr, c: cc });
        computeAdjacency(next);
        setStarted(true);
      }

      const target = next[rr][cc];
      if (target.isMine) {
        target.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        console.log(`Hard AI fallback random hit mine at (${rr},${cc})`);
        return;
      } else {
        floodFill(next, gridSize, rr, cc);
        didOpen = true;
      }

      setBoard(next);
      if (checkWin(next)) { setGameOver("won"); revealMines(); }
      return;
    }
  }

  // ********************************************************
  // Step 9: Last-resort: everything left is flagged: unflag one and open it
  // ********************************************************
  if (!didOpen) {
    const flaggedCovered: Array<[number, number]> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = next[r][c];
        if (cell.flagged && !cell.revealed) flaggedCovered.push([r, c]);
      }
    }
    if (flaggedCovered.length > 0) {
      const [rr, cc] = flaggedCovered[Math.floor(Math.random() * flaggedCovered.length)];
      console.log(`Hard AI last-resort: unflag + open (${rr},${cc})`);
      next[rr][cc].flagged = false;

      const placed = next.flat().filter(c => c.flagged).length;
      setFlagsLeft(Math.max(0, mines - placed));

      const target = next[rr][cc];
      if (target.isMine) {
        target.revealed = true;
        setBoard(next);
        setGameOver("lost");
        revealMines();
        return;
      } else {
        floodFill(next, gridSize, rr, cc);
        didOpen = true;
        setBoard(next);
        if (checkWin(next)) { setGameOver("won"); revealMines(); }
        return;
      }
    }
  }

  // ********************************************************
  // Step 10: If we only placed flags, commit the board
  // ********************************************************
  if (didFlag) {
    setBoard(next);
    if (checkWin(next)) { setGameOver("won"); revealMines(); }
  }
}

