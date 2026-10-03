import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { errorPolicies } from './errorPolicies';
import { filters } from './filters';
import { historyReplay } from './historyReplay';
import { memoryLeaks } from './memoryLeaks';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
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
  middleware,
  cancelableEvents,
  errorPolicies,
  recursionProtection,
  historyReplay,
  memoryLeaks
];
