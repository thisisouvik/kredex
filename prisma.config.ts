import { defineConfig } from '@prisma/config';

export default defineConfig({
  earlyAccess: true,
  studio: {
    // optional config
  },
  migrations: {
    url: process.env.DIRECT_URL,
  },
});
