const { incidentCategories } = require('../../config/communityConfig');
const cfg = require('../../config/assistant.config');
const { sanitizeUntrusted } = require('./sanitize');
const rules = require('../../shared/assistantRules');

/**
 * Report proposals. The model may SUGGEST a community report; it can never file one.
 *
 * What the server returns is only a proposal (type + description). The app shows it on a confirmation card and
 * calls the normal report API (POST /api/community/report) only after the user taps Confirm. Nothing in the
 * assistant code path imports or calls the community service: tests assert that.
 *
 * Two gates protect against a model being steered by untrusted text it was shown:
 *   1. looksLikeReportRequest(): the USER's own message must be about reporting something.
 *   2. validateProposal(): the type must be a configured category and the description is cleaned and limited.
 */

const looksLikeReportRequest = rules.looksLikeReportRequest;
const categoryNames = () => Object.keys(incidentCategories);

/**
 * @param {any} raw what the model returned in `reportProposal`
 * @returns {{incidentType:string, description:string}|null} null when it is not a valid proposal
 */
function validateProposal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.incidentType === 'string' ? raw.incidentType.trim() : '';
  const match = categoryNames().find((k) => k.toLowerCase() === type.toLowerCase());
  if (!match) return null;
  const description = sanitizeUntrusted(raw.description, cfg.proposal.descriptionMax);
  if (description.length < cfg.proposal.descriptionMin) return null;
  return { incidentType: match, description };
}

/** Model proposal, gated by the user's own message. */
function proposalFor(userMessage, modelProposal) {
  if (!looksLikeReportRequest(userMessage)) return null;
  return validateProposal(modelProposal);
}

/** Rule-based proposal (AI unavailable). */
function ruleProposalFor(userMessage) {
  return rules.proposeReportFromText(userMessage, categoryNames());
}

module.exports = { looksLikeReportRequest, validateProposal, proposalFor, ruleProposalFor };
