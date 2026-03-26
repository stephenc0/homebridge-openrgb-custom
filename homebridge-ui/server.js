const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { Client: OpenRGB } = require('openrgb-sdk');

class OpenRgbUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/discover', this.handleDiscover.bind(this));
    this.onRequest('/identify', this.handleIdentify.bind(this));
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
        devices.push({
          name: device.name,
          location: device.location,
          ledCount: device.colors?.length ?? device.leds?.length ?? 1,
          zones: (device.zones ?? []).map(z => ({ name: z.name, ledCount: z.ledsCount })),
        });
      } catch (_) {}
    }

    try { client.disconnect(); } catch (_) {}

    return { devices };
  }

  async handleIdentify({ host, port, name: serverName, deviceName, location }) {
    const client = new OpenRGB(serverName || 'homebridge-ui', port || 6742, host || 'localhost');

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), 5000)),
    ]);

    const count = await client.getControllerCount();
    let target = null;
    for (let i = 0; i < count; i++) {
      const device = await client.getControllerData(i);
      if (device.name === deviceName && (!location || device.location === location)) {
        target = device;
        break;
      }
    }

    if (!target) throw new Error(`Device "${deviceName}" not found on server`);

    const ledCount = target.colors.length;
    const original = target.colors;
    const white = Array(ledCount).fill({ red: 255, green: 255, blue: 255 });
    const off = Array(ledCount).fill({ red: 0, green: 0, blue: 0 });
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < 3; i++) {
      await client.updateLeds(target.deviceId, white);
      await sleep(300);
      await client.updateLeds(target.deviceId, off);
      await sleep(300);
    }
    await client.updateLeds(target.deviceId, original);

    try { client.disconnect(); } catch (_) {}

    return { ok: true };
  }
}

new OpenRgbUiServer();
