export default () => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
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
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    toolMaxIterations: parseInt(
      process.env.CLAUDE_TOOL_MAX_ITERATIONS || '8',
      10,
    ),
    /** false explicite pour désactiver ; true par défaut */
    promptCacheEnabled: process.env.ANTHROPIC_PROMPT_CACHE_ENABLED !== 'false',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
  },
  ai: {
    /** claude | openai */
    provider: process.env.AI_PROVIDER || 'claude',
  },
  conversation: {
    debounceDelayMs: parseInt(
      process.env.CONVERSATION_DEBOUNCE_DELAY_MS || '2500',
      10,
    ),
  },
  menu: {
    /** Au-delà : get_menu sans category renvoie la liste des catégories */
    categoryNavMinItems: parseInt(
      process.env.MENU_CATEGORY_NAV_MIN_ITEMS || '10',
      10,
    ),
    categoryNavMinCategories: parseInt(
      process.env.MENU_CATEGORY_NAV_MIN_CATEGORIES || '3',
      10,
    ),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  encryption: {
    /** 32 bytes base64 — AES-256 master key (HKDF → aes + phone hmac) */
    messageKeyBase64: process.env.MESSAGE_ENCRYPTION_KEY || '',
  },
});
