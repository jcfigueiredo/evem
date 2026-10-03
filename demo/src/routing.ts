import { slug } from './engine/program';

export interface Routable {
  id: string;
  group: string;
}

/** A scenario's address in the playground: #/<group>/<id> */
export function scenarioPath(scenario: Routable): string {
  return `#/${slug(scenario.group)}/${scenario.id}`;
}

/** The scenario a location hash points to, or the first one */
export function scenarioForHash<S extends Routable>(hash: string, scenarios: readonly S[]): S {
  const found = scenarios.find(scenario => scenarioPath(scenario) === hash);
  if (found) return found;
  if (scenarios.length === 0) throw new Error('There are no scenarios');
  return scenarios[0]!;
}
