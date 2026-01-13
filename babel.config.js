// babel.config.js
module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      plugins: [
        // Этот плагин нужен для работы анимаций Reanimated
        'react-native-reanimated/plugin',
      ],
    };
  };
  