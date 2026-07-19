/**
 * Purpose of this utility:
 * Define a configurable list of major festivals with their date ranges and crowd score bonuses.
 *
 * Why this exists:
 * Scoring logic should look up festival parameters dynamically without hardcoding dates
 * or bonuses, making it easy to add, modify, or adjust festivals.
 */

const festivals = [
  {
    name: 'Diwali',
    startDate: '2026-11-06',
    endDate: '2026-11-10',
    crowdBonus: 25,
  },
  {
    name: 'Holi',
    startDate: '2026-03-03',
    endDate: '2026-03-05',
    crowdBonus: 20,
  },
  {
    name: 'Ganesh Chaturthi',
    startDate: '2026-09-14',
    endDate: '2026-09-24',
    crowdBonus: 30,
  },
  {
    name: 'New Year',
    startDate: '2026-12-31',
    endDate: '2027-01-01',
    crowdBonus: 30,
  },
];

module.exports = {
  festivals,
};
