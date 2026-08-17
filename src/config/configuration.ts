export default () => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
});
