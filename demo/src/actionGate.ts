/**
 * Which run of a scenario's actions holds the action buttons. One run at a time; when the scenario starts over (a
 * control changed, Reset, edited code), `reset()` lets the buttons go, and a run from before it (one that's still
 * going, or never finishes) can no longer free them while a newer run holds them.
 */
export class ActionGate {
  private generation = 0;
  private holder: number | undefined;

  /** Whether a run holds the buttons */
  get busy(): boolean {
    return this.holder !== undefined;
  }

  /** Start a run: its token, or undefined while another run holds the buttons */
  start(): number | undefined {
    if (this.holder !== undefined) return undefined;
    this.holder = this.generation;
    return this.holder;
  }

  /** A run ended: true if it still held the buttons (so they can be enabled again) */
  end(token: number): boolean {
    if (token !== this.holder || token !== this.generation) return false;
    this.holder = undefined;
    return true;
  }

  /** The scenario started over: the buttons are free, and earlier runs no longer hold them */
  reset(): void {
    this.generation++;
    this.holder = undefined;
  }
}
