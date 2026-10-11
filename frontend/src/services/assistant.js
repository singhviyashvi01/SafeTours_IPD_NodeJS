import { apiClient } from './apiClient';
import { connectivityStore } from '../connectivity/connectivityStore';
import { communityService } from './communityService';
import { turnsForServer } from '../offline/chatLogic';
import { answerFromContext, proposeReportFromText } from '../offline/assistantRules';
import { buildLocalContext, currentPosition } from '../utils/assistantContext';

/**
 * Assistant client.
 *
 *  ONLINE  -> POST /api/assistant/chat (Gemini, with the server's own fallback inside). The reply says which
 *             one answered: source 'gemini' (label "AI") or 'rules' (label "offline assistant").
 *  OFFLINE -> no request at all: the rule-based answer from the data saved on the phone, labelled
 *             "offline assistant". There is never a made-up AI reply.
 *  Server unreachable / error -> same local answer, with `degraded` saying why.
 *
 * A report proposal is only data here. Filing it is a separate, explicit step (communityService.reportIncident)
 * taken from the confirmation card (offline/proposalFlow.js).
 */
const LABEL_LOCAL = 'offline assistant';

async function localAnswer(message, position, degraded) {
  const ctx = await buildLocalContext(position);
  const categories = await communityService.getCategories();
  const answer = answerFromContext(message, ctx);
  return {
    reply: answer.text,
    source: 'device',
    label: LABEL_LOCAL,
    reportProposal: proposeReportFromText(message, categories),
    degraded,
    context: { riskLevel: ctx.risk ? ctx.risk.level : null, demo: Boolean(ctx.risk && ctx.risk.demo), unavailable: ['weather', 'community', 'journey'] },
  };
}

/**
 * @param {{message:string, history:Array}} p history = the chat messages so far (turnsForServer trims them)
 */
export async function askAssistant({ message, history = [] }) {
  const position = await currentPosition();
  const conn = connectivityStore.getState();

  if (conn.isOffline) return localAnswer(message, position, conn.forced ? 'forced_offline' : 'offline');

  try {
    const res = await apiClient.post(
      '/assistant/chat',
      {
        message,
        history: turnsForServer(history),
        ...(position ? { location: { latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy ?? undefined } } : {}),
        connectivity: conn.state,
      },
      { timeout: 25000 }
    );
    const d = res.data;
    return { reply: d.reply, source: d.source, label: d.label, reportProposal: d.reportProposal || null, degraded: d.degraded || null, context: d.context || null };
  } catch (error) {
    const status = error && error.response ? error.response.status : 0;
    return localAnswer(message, position, status === 429 ? 'rate_limited' : status ? `server_${status}` : 'server_unreachable');
  }
}
