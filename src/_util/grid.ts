/**
 * File: src/_util/grid.ts
 * Module: Game Logic – Board & Cell Utilities
 * Brief: Defines the Cell type and provides core helpers for Minesweeper:
 *        board creation, mine placement (with first-click safety exclusion),
 *        adjacency computation, flood-fill reveal, and immutable cloning.
 *
 * Inputs:
 *   - Function-specific inputs documented below (rows/cols, mine count, board, etc.)
 * Outputs:
 *   - Returns board matrices or mutates provided board in-place (as noted per function)
 *
 * Side Effects:
 *   - Several helpers intentionally mutate the passed-in board (documented per function).
 *
 * External Sources / Attribution:
 *   - None;

 *
 * EECS 581 – Project 1 Compliance Notes:
 *   - Supports a fixed 10×10 grid at call-sites; user-selected mines 10–20.
 *   - First click safety: `placeMines` excludes the initially clicked cell and its neighbors.
 *   - `computeAdjacency` assigns 0–8 counts; `floodFill` expands when count is 0.
 *

 * Creation Date: 2025-09-09
 * Course: EECS 581 (Software Engineering II), Prof. Hossein Saiedian – Fall 2025
 */

export type Cell = {
  row: number;
  col: number;
  isMine: boolean;
  adjacent: number;  // number of neighboring mines (0–8); -1 used here to mark a mine for convenience
  revealed: boolean;
  flagged: boolean;
};

/**
 * Function: createEmptyBoard(rows, cols)  [Original]
 * Purpose: Create a rows×cols matrix of Cell objects initialized to a safe, covered state.
 * Inputs:
 *   - rows: number
 *   - cols: number
 * Outputs:
 *   - Returns a new Cell[][] with default values (no mines; adjacent=0; covered; unflagged).
 * Side Effects:
 *   - None (pure function returning a new matrix).
 */
export function createEmptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r,
      col: c,
      isMine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
    }))
  );
}

/**
 * Function: placeMines(board, mines, exclude)  [Original]
 * Purpose: Randomly place the requested number of mines on the board while enforcing
 *          first-click safety by excluding the initial cell and its 8 neighbors.
 * Inputs:
 *   - board: Cell[][] (will be mutated)
 *   - mines: number (requested count)
 *   - exclude: { r: number; c: number }  // the first-click position to exclude (and neighbors)
 * Outputs:
 *   - None (mutates `board` in place, setting `isMine=true` on chosen cells).
 * Notes:
 *   - Ensures uniqueness (no duplicate placement).
 *   - Exclusion: any (r,c) where |r-exclude.r| ≤ 1 and |c-exclude.c| ≤ 1.
 */
export function placeMines(board: Cell[][], mines: number, exclude: { r: number; c: number }) {
  const rows = board.length;
  const cols = board[0].length;
  let placed = 0;

  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);

    // [Original] Avoid placing on excluded cell and its 8 neighbors (first-click safety).
    if (Math.abs(r - exclude.r) <= 1 && Math.abs(c - exclude.c) <= 1) continue;

    const cell = board[r][c];
    if (!cell.isMine) {
      cell.isMine = true;
      placed++;
    }
  }
}

/**
 * Function: computeAdjacency(board)  [Original]
 * Purpose: For every non-mine cell, count neighboring mines in the 8 surrounding cells
 *          and store the count in `adjacent`. For mines, set `adjacent = -1` for convenience.
 * Inputs:
 *   - board: Cell[][] (will be mutated)
 * Outputs:
 *   - None (mutates `board` in place, filling `adjacent` for all cells).
 * Notes:
 *   - Uses a simple 3×3 neighborhood loop with bounds checks.
 */
export function computeAdjacency(board: Cell[][]) {
  const rows = board.length;
  const cols = board[0].length;
  const dirs = [-1, 0, 1];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) {
        board[r][c].adjacent = -1;  // mark mines distinctly
        continue;
      }

      let count = 0;
      for (const dr of dirs) for (const dc of dirs) {
        if (dr === 0 && dc === 0) continue; // skip self
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (board[nr][nc].isMine) count++;
        }
      }
      board[r][c].adjacent = count;
    }
  }
}

/**
 * Function: floodFill(board, size, row, col)  [Original]
 * Purpose: Reveal the connected region starting at (row,col) using an explicit stack (BFS/DFS hybrid),
 *          expanding through cells with `adjacent === 0`. Stops at numbered frontiers.
 * Inputs:
 *   - board: Cell[][] (will be mutated)
 *   - size: number  // board dimension (assumes square; used for bounds checks)
 *   - row: number
 *   - col: number
 * Outputs:
 *   - None (mutates `board` by setting `revealed=true` for visited cells).
 * Notes:
 *   - Respects flags: does not reveal flagged cells.
 *   - Only enqueues neighbors that are not revealed and not mines.
 */
export function floodFill(board: Cell[][], size: number, row: number, col: number) {
  const stack = [[row, col]];

  while (stack.length > 0) {
    const [rr, cc] = stack.pop()!;
    const cur = board[rr][cc];

    if (cur.revealed || cur.flagged) continue;  // skip already revealed or flagged cells
    cur.revealed = true;

    // [Original] If this cell has 0 adjacent mines, expand to all neighbors.
    if (cur.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue; // skip current cell
          const nr = rr + dr;
          const nc = cc + dc;
          // [Original] Bounds check within size×size (call-sites pass GRID_SIZE).
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            const neigh = board[nr][nc];
            if (!neigh.revealed && !neigh.isMine) {
              stack.push([nr, nc]);
            }
          }
        }
      }
    }
  }
}

/**
 * Function: cloneBoard(board)  [Original]
 * Purpose: Produce a shallow-deep clone of the board matrix to avoid mutating React state directly.
 * Inputs:
 *   - board: Cell[][]
 * Outputs:
 *   - Returns a new Cell[][] with cloned cell objects (spread-cloned per cell).
 * Notes:
 *   - This is sufficient for the current Cell shape (flat properties).
 */
export function cloneBoard(board: Cell[][]) {
  return board.map(row => row.map(cell => ({ ...cell })));
}

