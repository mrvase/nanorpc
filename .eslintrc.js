module.exports = {
  root: true,
  // This tells ESLint to load the config from the package `eslint-config-nanorpc`
  extends: ["nanorpc"],
  settings: {
    next: {
      rootDir: ["apps/*/"],
    },
  },
};
