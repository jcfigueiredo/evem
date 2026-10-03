import type { EvEm } from '@jcfigueiredo/evem';

// What the README's samples use without defining: the emitter from the Quick Start, and stand-ins for
// the reader's own code, typed loosely so the check is about EvEm's API, not about these
declare global {
  const evem: EvEm;
  const requestData: any;
  const userData: any;
  function autoTagDocument(...args: any[]): any;
  function checkUserPermissions(...args: any[]): any;
  function detectClientInfo(...args: any[]): any;
  function extractMetadata(...args: any[]): any;
  function handleDocUpdate(...args: any[]): any;
  function initializeApp(...args: any[]): any;
  function isAuthenticated(...args: any[]): any;
  function processData(...args: any[]): any;
  function saveDocument(...args: any[]): any;
  function showNotification(...args: any[]): any;
  function showOnboardingTutorial(...args: any[]): any;
  function showWelcomeDialog(...args: any[]): any;
  function suggestCompletions(...args: any[]): any;
  function updateDisplay(...args: any[]): any;
  function updateLayout(...args: any[]): any;
  function updateScrollIndicator(...args: any[]): any;
}

export {};
