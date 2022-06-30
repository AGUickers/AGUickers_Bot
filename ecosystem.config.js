module.exports = {
  apps : [{
    script: './app.js',
    watch: '.',
    ignore_watch: ['config', 'settings.db'],
  },
]
};
