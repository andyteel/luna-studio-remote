const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const getEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

module.exports = async function notarize(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const zipPath = path.join(appOutDir, `${appName}-notarize.zip`);
  const teamId = getEnv('APPLE_TEAM_ID');
  const profile = process.env.APPLE_NOTARYTOOL_PROFILE;
  const appleId = process.env.APPLE_ID;
  const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  await fs.rm(zipPath, { force: true });
  await execFileAsync('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  const args = ['notarytool', 'submit', zipPath, '--wait', '--team-id', teamId];

  if (profile) {
    args.push('--keychain-profile', profile);
  } else if (appleId && appPassword) {
    args.push('--apple-id', appleId, '--password', appPassword);
  } else {
    throw new Error(
      'Set APPLE_NOTARYTOOL_PROFILE, or set both APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD for notarization.',
    );
  }

  const { stdout, stderr } = await execFileAsync('xcrun', args, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stdout) {
    process.stdout.write(stdout);
  }

  if (stderr) {
    process.stderr.write(stderr);
  }
};
