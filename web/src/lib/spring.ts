// Critically damped spring, after Daniel Holden's "Spring-It-On" (github.com/orangeduck/Spring-It-On, MIT).
// A value chases its goal and settles without overshoot; halflife is the time to close half the gap.

const LN2 = 0.69314718056;

export interface SpringState {
  x: number;
  v: number;
}

/** One step of the exact critically damped spring-damper. */
export function springStep(state: SpringState, goal: number, halflife: number, dt: number): SpringState {
  const y = (2 * LN2) / (halflife + 1e-5);
  const j0 = state.x - goal;
  const j1 = state.v + j0 * y;
  const eydt = Math.exp(-y * dt);
  return { x: eydt * (j0 + j1 * dt) + goal, v: eydt * (state.v - j1 * y * dt) };
}

/** True once the spring is close enough to its goal to stop animating. */
export function springSettled(state: SpringState, goal: number, epsilon = 1e-3): boolean {
  return Math.abs(state.x - goal) < epsilon && Math.abs(state.v) < epsilon;
}
