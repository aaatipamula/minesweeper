/**
 * File: src/app/page.tsx
 * Module: User Interface – Minesweeper Page (Client Component)
 * Brief: Renders the Minesweeper screen (controls, counters, 10×10 grid, modal) and
 *        wires user interactions to game-logic utilities (board creation, mine placement,
 *        adjacency computation, flood-fill reveal, and win/loss detection).
 *
 * Inputs:
 *   - User interactions:
 *       • Number input (mines: 10–20) to set difficulty
 *       • Reset button to start a new game
 *       • Grid actions from <RenderGrid/>: left-click (reveal), right-click (flag)
 *   - Child components:
 *       • <RenderGrid/> props: { board, gridSize, reveal, flag }
 *       • <RenderModal/> props: { state: 'won'|'lost', close: () => void }
 *
 * Outputs:
 *   - UI: controls bar (timer, flags remaining), 10×10 grid with labels, win/loss modal
 *   - State transitions reflected visually (revealed cells, flags, status)
 *
 * Side Effects:
 *   - Starts/stops an interval timer while the game is active
 *   - Resets game state when mines count changes or when user clicks Reset
 *
 * External Sources / Attribution:
 *   - None;
 *
 * EECS 581 – Project 1 Compliance Notes:
 *   - Grid: fixed 10×10; mines: user-selected 10–20; random placement
 *   - First click guaranteed safe (mines placed excluding the first-click cell)
 *   - Flagged cells cannot be uncovered; flags remaining = mines − placed flags
 *   - Reveal numbers 0–8; zero triggers recursive flood-reveal
 *   - Status shown via modal (“won”/“lost”); Reset supported
 *

 * Creation Date: 2025-09-09
 * Course: EECS 581 (Software Engineering II), Prof. Hossein Saiedian – Fall 2025
 */

'use client'

import type { Cell } from "@/_util/grid"

import React, { useEffect, useState } from 'react';
import { FlagIcon, TimerIcon } from "lucide-react";

import RenderModal from "./RenderModal"
import RenderGrid from "./RenderGrid";
import {
  createEmptyBoard,
  placeMines,
  cloneBoard,
  floodFill,
  computeAdjacency,
} from '@/_util/grid';

import {
  easyAi,
  mediumAi,
  hardAi
} from './somewhere'; // Placeholder for AI strategies

// [Original] Fixed grid size per spec (10×10).
const GRID_SIZE = 10;

export default function MinesweeperPage() {
  // [Original] Default mine count within allowed range (10–20).
  const [mines, setMines] = useState(15);

  // New state for game mode: 'interactive' or 'automatic'
  const [aiMode, setAiMode] = useState<'interactive' | 'automatic' | 'off'>('off');
  // Additional state for interactive mode tracking if it's user or AI's turn
  const [isUserTurn, setIsUserTurn] = useState(true);

  // AI Difficulty Level
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');

  // [Original] Canonical game state.
  const [board, setBoard] = useState<Cell[][]>(() => createEmptyBoard(GRID_SIZE, GRID_SIZE));
  const [started, setStarted] = useState(false);                        // has the first reveal occurred?
  const [gameOver, setGameOver] = useState<null | 'lost' | 'won'>(null); // terminal state marker
  const [flagsLeft, setFlagsLeft] = useState(mines);                    // remaining flags (mines − placed)
  const [seconds, setSeconds] = useState(0);                            // elapsed time in seconds

  // [Original] If mines setting changes, start a fresh game.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mines]);

  // If mode or ai difficulty changes, reset the game and set turn to user
  useEffect(() => {
    reset();
    setIsUserTurn(true);
  }, [aiMode, aiDifficulty]);

  // AI Moves
  useEffect(() => {
    if ((aiMode === 'automatic' || (aiMode === 'interactive' && !isUserTurn)) && !gameOver) {
      const aiMoveInterval = setInterval(() => {
          // Build context object from current React state
        const ctx = {
          board,
          gridSize: GRID_SIZE,
          mines,
          started,
          setBoard,
          setStarted,
          setFlagsLeft,      // Medium uses this
          setGameOver,
          checkWin: (b: Cell[][]) => checkWin(b),
          revealMines: () => revealMines(),
        };
        // Simple AI: randomly reveal a cell that is not revealed or flagged
        if (aiDifficulty === 'easy') {
          easyAi(ctx); // Placeholder for easy AI logic
        } else if (aiDifficulty === 'medium') {
          mediumAi(ctx); // Placeholder for medium AI logic
        } else {
          hardAi(ctx); // Placeholder for hard AI logic
        }
        if (aiMode === 'interactive') {
          setIsUserTurn(true); // Switch back to user turn in interactive mode
        }
      }, 1000); // AI makes a move every second
      return () => clearInterval(aiMoveInterval);
    }
  }, [aiMode, isUserTurn, board, started, gameOver]);

  // [Original] Timer: run while the game has started and is not over.
  useEffect(() => {
    let t: number | undefined;
    if (started && !gameOver) {
      t = window.setInterval(() => setSeconds(s => s + 1), 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [started, gameOver]);

  // [Original] Reveal all mines (used on loss, and post-win to show final state).
  function revealMines(): void {
    setBoard(b => b.map(row => row.map(c0 => c0.isMine ? { ...c0, revealed: true } : c0)));
  }

  // [Original] Win condition:
  //  - every safe cell must be revealed
  //  - every mined cell must remain unrevealed
  function checkWin(board: Cell[][]): boolean {
    return board.every(rw =>
      rw.every(cell => (cell.isMine ? !cell.revealed : cell.revealed))
    )
  }

  // [Original] Reset overall game state to a clean slate.
  function reset() {
    setBoard(createEmptyBoard(GRID_SIZE, GRID_SIZE));
    setStarted(false);
    setGameOver(null);
    setFlagsLeft(mines);
    setSeconds(0);
  }

  // [Original] Handle a left-click reveal at (r,c).
  function revealCell(r: number, c: number) {
    if (gameOver) return;

    // Clone to avoid mutating React state directly.
    const newBoard = cloneBoard(board); // Clone the board not to trigger state changes

    // Check flag before first click safety logic.
    const cell = newBoard[r][c];
    if (cell.revealed || cell.flagged) return; // ignore invalid actions per rules

    if (!started) {
      // [Original] First-click safety:
      //  - place mines excluding the first-click position
      //  - compute adjacency counts once
      placeMines(newBoard, mines, { r, c });
      computeAdjacency(newBoard);
      setBoard(newBoard);
      setStarted(true);
    }

    if (cell.isMine) {
      // Hitting a mine ends the game immediately; reveal all mines.
      setGameOver("lost");
      revealMines();
      return;
    }

    // [Original] Reveal region; flood-fill handles zero-adjacent expansion.
    floodFill(newBoard, GRID_SIZE, r, c);
    setBoard(newBoard);

    // Check if this reveal leads to a win state.
    if (checkWin(newBoard)) {
      setGameOver("won");
      revealMines();
    }

    // If in interactive mode, switch turn to AI after user's move
    if (aiMode === 'interactive') {
      setIsUserTurn(false);
    }
  }

  // [Original] Handle right-click flag toggle at (r,c).
  function toggleFlag(e: React.MouseEvent, r: number, c: number) {
    e.preventDefault();
    if (gameOver) return;

    const newBoard = cloneBoard(board);
    const cell = newBoard[r][c];

    if (cell.revealed) return;               // cannot flag an already revealed cell

    // Toggle flag state on the cloned board.
    cell.flagged = !cell.flagged;

    // [Original] Recompute remaining flags from truth to keep counters consistent.
    const remaining = mines - newBoard.flat().filter(c0 => c0.flagged).length;
    setFlagsLeft(remaining);
    setBoard(newBoard);

    // Optional fast-path win check (all safe revealed & all mines un-revealed).
    if (checkWin(newBoard)) {
      setGameOver("won");
      revealMines();
    }
  }

  return (
    <div
      className="w-7/12 m-auto"
    >
      {/* [Original] Controls: difficulty (mines), AI, Reset, and HUD (timer +flags). */}
      <div className="flex gap-5 place-content-center mt-10">
        <label className="border-2 border-white rounded-md p-2" >Mines
          <input
            type="number"
            value={mines}
            min={10}
            max={20}
            // [Original] Clamp user input to allowed range (10–20).
            onChange={e => setMines(Math.max(10, Math.min(20, Number(e.target.value) || 10)))}
            className='px-2 mx-2'
          />
        </label>

        <button
          onClick={reset}
          className='cursor-pointer border-2 border-white rounded-md p-2 text-white hover:opacity-70'
        >
          Reset
        </button>

        {/* Interactive vs Automatic Mode Toggle */}
        <div className="flex items-center">
          <label className="mr-2">Mode:</label>
          <select
            value={aiMode}
            onChange={e => setAiMode(e.target.value as 'interactive' | 'automatic' | 'off')}
            className="border-2 border-white rounded-md p-2 bg-black text-white"
          >
            <option value="off">Off</option>
            <option value="interactive">Interactive</option>
            <option value="automatic">Automatic</option>
          </select>
        </div>

        {/* AI Difficulty Selection, for all AI modes */}
        <div className="flex items-center">
          <label className="mr-2">AI Difficulty:</label>
          <select
            value={aiDifficulty}
            onChange={e => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            className="border-2 border-white rounded-md p-2 bg-black text-white"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* [Original] HUD: simple timer and flags remaining. */}
        <div className="ml-auto flex gap-5 items-center border-2 border-white rounded-md p-2">
          <span className="flex items-center gap-1">
            <TimerIcon color="white"/>
            {seconds}s
          </span>
          <span className="flex items-center gap-1">
            <FlagIcon color="var(--color-sky-700)"/>
            {flagsLeft}
          </span>
        </div>
      </div>

      {/* [Original] Grid and end-of-game modal. */}
      <div className="mt-10 relative">
        <RenderGrid
          board={board}
          gridSize={GRID_SIZE}
          reveal={revealCell}
          flag={toggleFlag}
        />
        {gameOver && <RenderModal state={gameOver} close={() => reset()}/>}
      </div>
    </div>
  );
}
