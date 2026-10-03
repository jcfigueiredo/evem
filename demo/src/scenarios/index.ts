import type { Scenario } from '../engine/session';
import { filters } from './filters';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [publishSubscribe, wildcards, priorities, filters, once];
