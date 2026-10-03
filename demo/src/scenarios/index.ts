import type { Scenario } from '../engine/session';
import { priorities } from './priorities';

/** Every scenario, in sidebar order (grouped as they follow each other) */
export const scenarios: readonly Scenario[] = [priorities];
