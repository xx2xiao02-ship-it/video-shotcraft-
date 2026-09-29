export const MODE_C_STATES = Object.freeze([
  'pending_generation',
  'generating',
  'generated',
  'verifying',
  'verified',
  'generation_failed',
  'blocked',
  'card_rematch',
]);

export function assertModeCState(state) {
  if (!MODE_C_STATES.includes(state)) throw new Error(`模式 C 状态无效：${state}`);
  return state;
}

export function withModeCState(value, state) {
  assertModeCState(state);
  return {...value, state, status:state};
}
