import type { Scenario } from '../engine/session';
import { filters } from './filters';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { schemaValidation } from './schemaValidation';
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
  transforms,
  schemaValidation,
  middleware
];
