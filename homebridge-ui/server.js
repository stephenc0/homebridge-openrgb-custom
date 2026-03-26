const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { Client: OpenRGB } = require('openrgb-sdk');

class OpenRgbUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/discover', this.handleDiscover.bind(this));
    this.ready();
  }

  async handleDiscover({ host, port, name }) {
    const client = new OpenRGB(name || 'homebridge-ui', port || 6742, host || 'localhost');

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), 5000)),
    ]);

    const count = await client.getControllerCount();
    const devices = [];
    for (let i = 0; i < count; i++) {
      try {
        const device = await client.getControllerData(i);
        devices.push({ name: device.name, location: device.location });
      } catch (_) {}
    }

    try { client.disconnect(); } catch (_) {}

    return { devices };
  }
}

new OpenRgbUiServer();
