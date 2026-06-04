import fs from 'fs';
import path from 'path';
import { config } from './config.js';

class SettingsManager {
  constructor() {
    this.filePath = path.join(config.agy.brainDir, 'bridge-settings.json');
    this.settings = {
      language: 'zh',
      theme: 'default',
      wideScreen: true
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.settings = { ...this.settings, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('[Settings] Failed to load settings from disk', e);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[Settings] Failed to save settings to disk', e);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  getAll() {
    return this.settings;
  }
}

export const settingsManager = new SettingsManager();
