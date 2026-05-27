const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

let _config = null;

function loadConfig() {
  if (_config) return _config;
  const filePath = path.join(__dirname, "..", "config.yml");
  if (!fs.existsSync(filePath)) {
    console.error("[CONFIG] config.yml not found. Copy config.yml.example to config.yml and fill it in.");
    process.exit(1);
  }
  _config = yaml.load(fs.readFileSync(filePath, "utf8"));
  return _config;
}

function getConfig() {
  return loadConfig();
}

module.exports = { loadConfig, getConfig };
