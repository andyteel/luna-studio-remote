import os from 'node:os';

export const getLanUrls = (port: number): string[] => {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }

  return urls;
};
