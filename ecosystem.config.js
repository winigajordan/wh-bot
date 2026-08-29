module.exports = {
    apps: [
      {
        name: 'wh-bot-api',
        script: 'dist/main.js',
        cwd: '/var/www/wh-bot/api',
        instances: 1,
        exec_mode: 'fork',
        env_production: {
          NODE_ENV: 'production',
        },
        max_memory_restart: '400M',
        autorestart: true,
        watch: false,
      },
    ],
  };