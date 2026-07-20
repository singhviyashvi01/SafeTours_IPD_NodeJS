#!/usr/bin/env node
/**
 * generateH3Grid.js — SafeTours IPD
 *
 * One-time initialization script to generate the base H3 grid for Mumbai.
 * This grid forms the spatial foundation for the Dynamic Risk Score system.
 *
 * Usage:
 *   node src/scripts/generateH3Grid.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const mongoose = require('mongoose');
const h3 = require('h3-js');
const logger = require('../utils/logger');
const h3GridService = require('../services/h3GridService');

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const RESOLUTION = 9; // Configurable H3 resolution (9 is a good balance for city blocks)

// Coordinates format for h3-js v4 polygonToCells: [lng, lat] (GeoJSON format)
const MUMBAI_BOUNDARY = [
  [72.7700, 18.8900], // South-West (approx Colaba)
  [73.0000, 18.8900], // South-East
  [73.0000, 19.3000], // North-East (approx Mulund/Thane border)
  [72.7700, 19.3000], // North-West (approx Dahisar)
  [72.7700, 18.8900]  // Close polygon
];

async function main() {
  if (!MONGO_URI) {
    logger.error('MONGO_URI is not defined in .env');
    process.exit(1);
  }

  logger.info('=== H3 Grid Generation Script — SafeTours IPD ===');
  logger.info(`Target Resolution: ${RESOLUTION}`);

  // Connect to MongoDB
  logger.info('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  logger.info(`Connected to: ${mongoose.connection.host}`);

  // Clear existing (wrong) cells before generating new ones
  logger.info('Clearing old grid cells...');
  await h3GridService.clearGrid();

  // Generate H3 Cells for the Mumbai polygon
  logger.info('Generating H3 index cells from boundary...');
  const h3Indexes = h3.polygonToCells(MUMBAI_BOUNDARY, RESOLUTION, true);
  logger.info(`Total H3 cells generated: ${h3Indexes.length}`);

  if (h3Indexes.length === 0) {
    logger.error('No cells generated. Check polygon coordinates or resolution.');
    process.exit(1);
  }

  // Construct GridCell documents
  const gridCells = h3Indexes.map(index => {
    // h3.cellToBoundary returns an array of [lat, lng] vertices for the hexagon
    const boundary = h3.cellToBoundary(index);
    // h3.cellToLatLng returns the center [lat, lng]
    const [centerLat, centerLng] = h3.cellToLatLng(index);

    // GeoJSON requires [lng, lat]. We already have [lng, lat] in boundary.
    const geoJsonCoords = boundary.map(coord => [coord[1], coord[0]]);
    // Ensure the polygon is closed
    if (
      geoJsonCoords.length > 0 && 
      (geoJsonCoords[0][0] !== geoJsonCoords[geoJsonCoords.length - 1][0] || 
       geoJsonCoords[0][1] !== geoJsonCoords[geoJsonCoords.length - 1][1])
    ) {
      geoJsonCoords.push([...geoJsonCoords[0]]);
    }

    return {
      h3Index: index,
      geometry: {
        type: 'Polygon',
        // coordinates must be an array of linear rings, so we wrap it in another array
        coordinates: [geoJsonCoords]
      },
      center: {
        lat: centerLat,
        lng: centerLng
      },
      // Default scores are handled by Mongoose schema
      crimeScore: 0,
      crowdScore: 0,
      weatherScore: 0,
      newsScore: 0,
      totalRisk: 0,
      level: 'SAFE'
    };
  });

  // Bulk Insert into MongoDB
  logger.info('Executing bulk upsert to GridCell collection...');
  const result = await h3GridService.insertCellsBulk(gridCells);
  
  const totalInDb = await h3GridService.countCells();

  logger.info('─────────────────────────────────────────');
  logger.info('  GRID GENERATION COMPLETE  ');
  logger.info('─────────────────────────────────────────');
  logger.info(`  Resolution         : ${RESOLUTION}`);
  logger.info(`  Cells generated    : ${h3Indexes.length}`);
  logger.info(`  New cells inserted : ${result.upsertedCount}`);
  logger.info(`  Existing modified  : ${result.modifiedCount}`);
  logger.info(`  Total in database  : ${totalInDb}`);
  logger.info('─────────────────────────────────────────');

  await mongoose.disconnect();
  logger.info('MongoDB connection closed. Script finished.');
  process.exit(0);
}

main().catch(error => {
  logger.error('Fatal error during grid generation', error);
  mongoose.disconnect().finally(() => process.exit(1));
});
