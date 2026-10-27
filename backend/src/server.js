/**
 * ExamSeat AI backend entrypoint.
 *
 * Run with:  npm start   (or `npm run dev` for auto-restart on change)
 */
'use strict';

const { settings, ensureDirectories } = require('./config');
const { connectDb, getMode } = require('./db/connect');
const { loadRuntimeSettings } = require('./services/settingsService');
const { createApp } = require('./app');

async function main() {
  ensureDirectories();
  loadRuntimeSettings();
  await connectDb();

  const app = createApp();
  app.listen(settings.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `ExamSeat AI backend listening on port ${settings.PORT} ` +
        `[data backend: ${getMode() === 'mongo' ? 'MongoDB' : 'embedded local datastore (sandbox fallback)'}, ` +
        `detection backend: ${settings.DETECTION_BACKEND}]`
    );
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
