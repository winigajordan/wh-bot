export default () => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    pass: process.env.DB_PASS || '',
    name: process.env.DB_NAME,
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },
  conversation: {
    debounceDelayMs: parseInt(
      process.env.CONVERSATION_DEBOUNCE_DELAY_MS || '2500',
      10,
    ),
  },
});
