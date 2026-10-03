import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { chat } from './chat';
import { connectionQueue } from './connectionQueue';
import { debounce } from './debounce';
import { errorPolicies } from './errorPolicies';
import { filters } from './filters';
import { historyReplay } from './historyReplay';
import { memoryLeaks } from './memoryLeaks';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
import { requests } from './requests';
import { serverEvents } from './serverEvents';
import { schemaValidation } from './schemaValidation';
import { throttle } from './throttle';
import { throttleDebounce } from './throttleDebounce';
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
  throttle,
  debounce,
  throttleDebounce,
  transforms,
  schemaValidation,
  middleware,
  cancelableEvents,
  errorPolicies,
  recursionProtection,
  historyReplay,
  memoryLeaks,
  connectionQueue,
  requests,
  serverEvents,
  chat
];
