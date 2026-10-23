// State machines — docs/14-data-model-and-migration.md M2.
//
// Every record type with a status declares its states and the moves allowed
// between them. Changing a status anywhere else than through `assertMove` is
// a bug: the code refuses any move not in the table (03 C1).

export class InvalidTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: cannot move from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export interface StateMachine<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly initial: S;
  readonly terminal: readonly S[];
  isState(value: unknown): value is S;
  next(from: S): readonly S[];
  canMove(from: S, to: S): boolean;
  assertMove(from: S, to: S): void;
}

export function defineMachine<const S extends string>(definition: {
  name: string;
  initial: NoInfer<S>;
  transitions: { [K in S]: readonly NoInfer<S>[] };
}): StateMachine<S> {
  const { name, initial, transitions } = definition;
  const states = Object.keys(transitions) as S[];
  const terminal = states.filter((s) => transitions[s].length === 0);

  const isState = (value: unknown): value is S =>
    typeof value === "string" && Object.prototype.hasOwnProperty.call(transitions, value);

  const canMove = (from: S, to: S) => isState(from) && transitions[from].includes(to);

  return {
    name,
    states,
    initial,
    terminal,
    isState,
    next: (from) => (isState(from) ? transitions[from] : []),
    canMove,
    assertMove(from, to) {
      if (!canMove(from, to)) throw new InvalidTransitionError(name, from, to);
    },
  };
}
