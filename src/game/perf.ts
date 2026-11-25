/** Per-second snapshot of what the game is handling. */
export interface PerfSample {
  /** seconds of recorded (running) time */
  t: number
  enemies: number
  projectiles: number
  effects: number
  /** every PixiJS display object currently on stage */
  displayObjects: number
}

/**
 * Frame-time recorder for profiling, enabled with `?perf`. Only frames of a running match are
 * recorded (paused/ended frames are skipped), and one entity sample is taken per second.
 */
export class PerfRecorder {
  readonly frames: number[] = []
  readonly samples: PerfSample[] = []
  /** frames slower than two vsync intervals, with the recorded time at which they happened */
  readonly longFrames: { t: number; ms: number }[] = []
  private elapsedMs = 0
  private nextSampleMs = 1000

  record(deltaMs: number, sample: () => Omit<PerfSample, 't'>) {
    this.frames.push(deltaMs)
    this.elapsedMs += deltaMs
    if (deltaMs > 33.4) this.longFrames.push({ t: +(this.elapsedMs / 1000).toFixed(2), ms: +deltaMs.toFixed(1) })
    if (this.elapsedMs >= this.nextSampleMs) {
      this.nextSampleMs += 1000
      this.samples.push({ t: Math.round(this.elapsedMs / 1000), ...sample() })
    }
  }
}

export function perfEnabled() {
  return new URLSearchParams(location.search).has('perf')
}

declare global {
  interface Window {
    __PIRATE_PERF__?: PerfRecorder
  }
}
