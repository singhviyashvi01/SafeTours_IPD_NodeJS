/**
 * mumbaiGazetteer.js — hand-curated list of Mumbai localities with approximate centroids.
 *
 * Used by the news pipeline to place an article on the map without a geocoding call. Coordinates are
 * approximate (typically within ~0.5 km of the locality centre) and were written by hand: verify or
 * replace them against OpenStreetMap if you need better. Localities not listed here fall back to
 * geocoding (cached) in services/news/locationExtractor.js.
 *
 * aliases: other spellings / abbreviations seen in headlines (matched as whole words, case-insensitive).
 */
const localities = [
  { name: 'Colaba', lat: 18.9067, lng: 72.8147, aliases: ['Cuffe Parade'] },
  { name: 'Nariman Point', lat: 18.9256, lng: 72.8242, aliases: [] },
  { name: 'Churchgate', lat: 18.9322, lng: 72.8264, aliases: [] },
  { name: 'Fort', lat: 18.9322, lng: 72.8353, aliases: ['Kala Ghoda'] },
  { name: 'CSMT', lat: 18.9402, lng: 72.8356, aliases: ['CST', 'Chhatrapati Shivaji Terminus', 'Chhatrapati Shivaji Maharaj Terminus', 'VT'] },
  { name: 'Gateway of India', lat: 18.922, lng: 72.8347, aliases: ['Apollo Bunder'] },
  { name: 'Marine Lines', lat: 18.944, lng: 72.823, aliases: ['Marine Drive'] },
  { name: 'Grant Road', lat: 18.9643, lng: 72.8153, aliases: [] },
  { name: 'Girgaon', lat: 18.9547, lng: 72.8138, aliases: ['Girgaum', 'Charni Road'] },
  { name: 'Malabar Hill', lat: 18.9548, lng: 72.7985, aliases: ['Walkeshwar'] },
  { name: 'Mumbai Central', lat: 18.9696, lng: 72.8196, aliases: ['Tardeo'] },
  { name: 'Byculla', lat: 18.978, lng: 72.833, aliases: [] },
  { name: 'Mazgaon', lat: 18.965, lng: 72.844, aliases: ['Mazagaon'] },
  { name: 'Lalbaug', lat: 18.9845, lng: 72.8335, aliases: ['Lalbagh'] },
  { name: 'Parel', lat: 18.998, lng: 72.837, aliases: [] },
  { name: 'Lower Parel', lat: 18.993, lng: 72.83, aliases: ['Elphinstone', 'Prabhadevi'] },
  { name: 'Worli', lat: 19.0176, lng: 72.818, aliases: [] },
  { name: 'Dadar', lat: 19.0178, lng: 72.8478, aliases: ['Shivaji Park'] },
  { name: 'Matunga', lat: 19.027, lng: 72.857, aliases: [] },
  { name: 'Wadala', lat: 19.017, lng: 72.856, aliases: [] },
  { name: 'Mahim', lat: 19.041, lng: 72.84, aliases: [] },
  { name: 'Dharavi', lat: 19.043, lng: 72.8553, aliases: [] },
  { name: 'Sion', lat: 19.039, lng: 72.8619, aliases: [] },
  { name: 'Bandra', lat: 19.0596, lng: 72.8295, aliases: ['Bandra West', 'Bandra East'] },
  { name: 'BKC', lat: 19.0674, lng: 72.869, aliases: ['Bandra Kurla Complex'] },
  { name: 'Kurla', lat: 19.0726, lng: 72.8845, aliases: [] },
  { name: 'Chembur', lat: 19.0522, lng: 72.9005, aliases: [] },
  { name: 'Santacruz', lat: 19.081, lng: 72.841, aliases: ['Santa Cruz'] },
  { name: 'Vile Parle', lat: 19.1, lng: 72.844, aliases: ['Vileparle'] },
  { name: 'Juhu', lat: 19.1075, lng: 72.8263, aliases: [] },
  { name: 'Ghatkopar', lat: 19.086, lng: 72.908, aliases: [] },
  { name: 'Andheri', lat: 19.1197, lng: 72.8464, aliases: ['Andheri East', 'Andheri West'] },
  { name: 'Powai', lat: 19.1176, lng: 72.906, aliases: [] },
  { name: 'Vikhroli', lat: 19.11, lng: 72.927, aliases: [] },
  { name: 'Versova', lat: 19.131, lng: 72.818, aliases: [] },
  { name: 'Jogeshwari', lat: 19.136, lng: 72.849, aliases: [] },
  { name: 'Goregaon', lat: 19.1663, lng: 72.8526, aliases: [] },
  { name: 'Bhandup', lat: 19.144, lng: 72.937, aliases: [] },
  { name: 'Malad', lat: 19.1874, lng: 72.8484, aliases: ['Malvani'] },
  { name: 'Mulund', lat: 19.1726, lng: 72.9425, aliases: [] },
  { name: 'Kandivali', lat: 19.2037, lng: 72.8526, aliases: ['Kandivli'] },
  { name: 'Borivali', lat: 19.2307, lng: 72.8567, aliases: ['Borivli'] },
  { name: 'Dahisar', lat: 19.25, lng: 72.859, aliases: [] },
];

// Words that look like places in a headline but are not usable locations.
const NOT_PLACES = new Set([
  'mumbai', 'maharashtra', 'india', 'thane', 'navi mumbai', 'pune', 'delhi', 'bmc', 'police', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december', 'the', 'a', 'an', 'this', 'that', 'city',
  'state', 'centre', 'center', 'court', 'high court', 'supreme court', 'government', 'ministry',
]);

module.exports = { localities, NOT_PLACES };
