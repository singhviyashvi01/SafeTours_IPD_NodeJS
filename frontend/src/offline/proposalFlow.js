'use strict';

/**
 * Report proposal flow (pure). The assistant can only PROPOSE a community report. This state machine is the
 * reason nothing is filed without the user: a report is submitted ONLY from the 'confirming' state, and
 * 'confirming' is reachable only through confirm(), which the UI calls from the Confirm button.
 *
 *   proposed --confirm()--> confirming --submit()--> submitted | queued | failed
 *      |                                              (failed can be confirmed again)
 *      +--dismiss()--> dismissed
 */
const create = (proposal) => ({ status: 'proposed', proposal, error: null });

const confirm = (state) => (state.status === 'proposed' || state.status === 'failed' ? { ...state, status: 'confirming', error: null } : state);

const dismiss = (state) => (state.status === 'proposed' || state.status === 'failed' ? { ...state, status: 'dismissed' } : state);

const canSubmit = (state) => state.status === 'confirming';

/**
 * Runs `send(proposal)` only when the user has confirmed. `send` resolves to the community service result
 * { success, queued?, message?, error? }.
 * @returns {Promise<{state:Object, called:boolean}>}
 */
async function submit(state, send) {
  if (!canSubmit(state)) return { state, called: false };
  // Mark first so a double tap cannot send twice.
  const inFlight = { ...state, status: 'sending' };
  let result;
  try {
    result = await send(state.proposal);
  } catch (e) {
    return { state: { ...inFlight, status: 'failed', error: e.message || 'Could not send the report' }, called: true };
  }
  if (result && result.success && result.queued) return { state: { ...inFlight, status: 'queued', error: null }, called: true };
  if (result && result.success) return { state: { ...inFlight, status: 'submitted', error: null }, called: true };
  return { state: { ...inFlight, status: 'failed', error: (result && result.error && result.error.message) || 'Could not send the report' }, called: true };
}

module.exports = { create, confirm, dismiss, canSubmit, submit };
