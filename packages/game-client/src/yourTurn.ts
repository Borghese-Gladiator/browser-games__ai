// Pure "your turn" detection. No DOM deps so it's unit-testable.

// True only on the tick where the active seat transitions TO mySeat.
export function isYourTurn(
  prevActiveSeat: number | null | undefined,
  nextActiveSeat: number | null | undefined,
  mySeat: number | null | undefined,
): boolean {
  return (
    mySeat != null &&
    mySeat >= 0 &&
    nextActiveSeat === mySeat &&
    prevActiveSeat !== mySeat
  );
}
