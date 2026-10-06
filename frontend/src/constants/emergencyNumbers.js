/**
 * India's national emergency numbers (static reference data, not mock data). Always shown as the
 * fallback, since they work with no lookup and no data connection to our servers.
 */
export const EMERGENCY_NUMBERS = [
  { key: 'all', label: 'Emergency (all services)', number: '112', icon: 'alert-circle' },
  { key: 'police', label: 'Police', number: '100', icon: 'shield' },
  { key: 'fire', label: 'Fire', number: '101', icon: 'flame' },
  { key: 'ambulance', label: 'Ambulance', number: '102', icon: 'medkit' },
  { key: 'women', label: 'Women helpline', number: '1091', icon: 'woman' },
];
