/**
 * MongoDB connection.
 *
 * Standard Mongoose connect -- this is the real, normal MERN data layer.
 * `npm run dev` on the user's own machine (or any host that can reach
 * MongoDB) needs nothing else: set MONGODB_URI and go.
 *
 * In an environment where MongoDB can't be reached (see the long comment
 * in src/db/localStore.js for why that's true of *this* cloud sandbox),
 * connection fails fast and src/db/modelFactory.js falls back to the
 * embedded local datastore so the app still runs for development/testing.
 */
'use strict';

const mongoose = require('mongoose');
const { settings } = require('../config');

let mode = 'unknown'; // 'mongo' | 'local'

async function connectDb() {
  try {
    await mongoose.connect(settings.MONGODB_URI, {
      serverSelectionTimeoutMS: settings.MONGODB_CONNECT_TIMEOUT_MS,
    });
    mode = 'mongo';
    // eslint-disable-next-line no-console
    console.log(`[db] Connected to MongoDB at ${settings.MONGODB_URI}`);
  } catch (err) {
    mode = 'local';
    // eslint-disable-next-line no-console
    console.warn(
      `[db] Could not reach MongoDB at ${settings.MONGODB_URI} (${err.message}).\n` +
        '[db] Falling back to the embedded local JSON datastore (data/localdb/) for this run.\n' +
        '[db] This is expected in network-restricted sandboxes; on a normal machine, install/point ' +
        'MONGODB_URI at a real MongoDB instance (local mongod, Docker, or Atlas) and this app uses it directly.'
    );
  }
  return mode;
}

function getMode() {
  return mode;
}

module.exports = { connectDb, getMode };
