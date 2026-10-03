/**
 * validateRisk.js: prints expected vs actual risk level for 15 Mumbai test points (read-only).
 *
 *   npm run validate:risk                         # evaluate "now"
 *   npm run validate:risk -- --at 2026-10-03T22:30:00+05:30   # evaluate at a given time (night rules etc.)
 *
 * IMPORTANT: the "expected" ranges below are STRUCTURAL PRIORS written by hand (transit hubs are
 * crowded, planned residential areas and forest edges are calm). They are not ground truth and say
 * nothing about real crime. They exist so you can see whether the engine's output moves in a sensible
 * direction while you tune config/risk.config.js. Edit the list freely.
 *
 * Crime caveat: until real crime data is loaded (npm run crime:build -- file.csv), the crime component
 * is missing or demo data. In that case every result here is MEANINGLESS FOR CRIME and the script says so.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');

const points = [
  { name: 'Marine Drive promenade', lat: 18.944, lng: 72.823, expected: ['LOW', 'MODERATE'], why: 'busy seafront, crowds in the evening' },
  { name: 'Gateway of India', lat: 18.922, lng: 72.8347, expected: ['LOW', 'MODERATE'], why: 'major tourist magnet' },
  { name: 'CSMT station', lat: 18.9402, lng: 72.8356, expected: ['MODERATE', 'HIGH'], why: 'largest rail hub, crush/pickpocket risk' },
  { name: 'Dadar station', lat: 19.0178, lng: 72.8478, expected: ['MODERATE', 'HIGH'], why: 'interchange hub, heavy crowds' },
  { name: 'Kurla station', lat: 19.0653, lng: 72.8793, expected: ['MODERATE', 'HIGH'], why: 'interchange hub, heavy crowds' },
  { name: 'Andheri station', lat: 19.1197, lng: 72.8464, expected: ['MODERATE', 'HIGH'], why: 'interchange + metro, heavy crowds' },
  { name: 'Ghatkopar station', lat: 19.086, lng: 72.908, expected: ['MODERATE', 'HIGH'], why: 'rail + metro interchange' },
  { name: 'Borivali station', lat: 19.2307, lng: 72.8567, expected: ['LOW', 'HIGH'], why: 'terminal hub, wide range accepted' },
  { name: 'Mumbai airport T2', lat: 19.0896, lng: 72.8656, expected: ['LOW', 'MODERATE'], why: 'controlled area, high footfall' },
  { name: 'Juhu beach', lat: 19.0987, lng: 72.8267, expected: ['LOW', 'MODERATE'], why: 'leisure crowds at evenings/weekends' },
  { name: 'Bandra (west) residential', lat: 19.0596, lng: 72.8295, expected: ['SAFE', 'MODERATE'], why: 'mixed residential' },
  { name: 'Powai lake side', lat: 19.1176, lng: 72.906, expected: ['SAFE', 'LOW'], why: 'planned residential, low crowd magnets' },
  { name: 'Mulund residential', lat: 19.1726, lng: 72.9425, expected: ['SAFE', 'LOW'], why: 'suburban residential' },
  { name: 'SGNP interior (forest)', lat: 19.2147, lng: 72.9106, expected: ['SAFE', 'LOW'], why: 'forest, almost no crowd magnets' },
  { name: 'Pune (outside coverage)', lat: 18.5204, lng: 73.8567, expected: ['UNKNOWN'], why: 'negative control: must never be reported as safe' },
];

const atArg = process.argv.indexOf('--at');
const now = atArg > -1 ? new Date(process.argv[atArg + 1]) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error('Invalid --at value. Use an ISO timestamp, e.g. 2026-10-03T22:30:00+05:30');
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

(async () => {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const cellRisk = require('../services/risk/cellRisk.service');
  const feedStatus = require('../services/risk/feedStatus.service');
  const feeds = await feedStatus.getAll({ fresh: true });
  const crimeSource = feeds.crime?.stats?.source || 'none';

  console.log(`\nEvaluated at ${now.toISOString()}   crime source: ${crimeSource}\n`);
  if (crimeSource !== 'csv') {
    console.log('*'.repeat(78));
    console.log(`* CRIME RESULTS ARE MEANINGLESS: crime source is "${crimeSource}", not real CSV data.   *`);
    console.log('* Load real data with: npm run crime:build -- path/to/crimes.csv                     *');
    console.log('*'.repeat(78) + '\n');
  }

  console.log(`${pad('Point', 26)} ${pad('Expected', 18)} ${pad('Actual', 9)} ${pad('Score', 6)} ${pad('Conf', 5)} ${pad('Crime/Weather/Crowd/Comm/News', 30)} Result`);
  console.log('-'.repeat(120));

  let match = 0;
  let noData = 0;
  for (const p of points) {
    const r = await cellRisk.getRiskAt(p.lat, p.lng, { now });
    const b = r.breakdown;
    const f = (v) => (v === null || v === undefined ? ' - ' : String(Math.round(v)).padStart(3));
    const comps = [b.crime, b.weather, b.crowd, b.community, b.news].map(f).join('/');
    const expectedText = p.expected.length === 1 ? p.expected[0] : `${p.expected[0]}..${p.expected[p.expected.length - 1]}`;

    let verdict;
    if (r.riskLevel === 'UNKNOWN' && !p.expected.includes('UNKNOWN')) {
      verdict = 'NO DATA';
      noData += 1;
    } else {
      const order = ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'];
      const lo = order.indexOf(p.expected[0]);
      const hi = order.indexOf(p.expected[p.expected.length - 1]);
      const at = order.indexOf(r.riskLevel);
      const ok = p.expected.includes('UNKNOWN') ? r.riskLevel === 'UNKNOWN' : at >= lo && at <= hi;
      verdict = ok ? 'ok' : at < lo ? 'LOWER than expected' : 'HIGHER than expected';
      if (ok) match += 1;
    }
    const score = r.totalRiskScore === null ? '-' : r.totalRiskScore.toFixed(1);
    console.log(`${pad(p.name, 26)} ${pad(expectedText, 18)} ${pad(r.riskLevel, 9)} ${pad(score, 6)} ${pad(r.dataConfidence.toFixed(2), 5)} ${pad(comps, 30)} ${verdict}`);
  }

  console.log('-'.repeat(120));
  console.log(`${match}/${points.length} within expected range, ${noData} with no data.`);
  console.log('Expected ranges are structural priors, not ground truth (see the header of this script).');
  if (crimeSource !== 'csv') console.log('Remember: crime is not real data yet, so treat these results as plumbing checks only.');
  await mongoose.disconnect();
})().catch((e) => {
  console.error('validate:risk failed:', e.message);
  process.exit(1);
});
