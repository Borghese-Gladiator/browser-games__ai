// Reason rendering now lives in the analysis engine so the trainer and the
// post-game review render structured reasons identically. Re-export it so
// existing trainer imports keep working.
export { renderReason, renderReasons } from '@browser-games/engine-mahjong-analysis';
