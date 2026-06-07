import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
};

export const config = {
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  testMode: parseBoolean(process.env.TEST_MODE, false),
  enableKeystrokes: parseBoolean(process.env.ENABLE_KEYSTROKES, true),
  lunaAppName: process.env.LUNA_APP_NAME?.trim() || 'LUNA',
  appPin: process.env.APP_PIN?.trim() || '',
  isDev: process.env.NODE_ENV !== 'production',
};
