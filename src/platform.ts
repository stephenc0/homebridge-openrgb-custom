import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, DEFAULT_DISCOVERY_INTERVAL, SERVER_CONNECTION_TIMEOUT, DEFAULT_DEVICE_NAME } from './settings';
import { OpenRgbPlatformAccessory } from './platformAccessory';

import { RgbServer, RgbDevice, RgbDeviceContext } from './rgb';
import { Client as OpenRGB } from 'openrgb-sdk';
import { getDeviceLedRgbColor, findDeviceModeId, isLedOff } from './utils';
import { Color } from './rgb';

/**
 * HomebridgePlatform
 * This class is the main constructor for the plugin, this is where it should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class OpenRgbPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public accessories: PlatformAccessory<RgbDeviceContext>[] = [];

  // track which accessories have registered handlers
  public handlerUuids: string[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');

      let isConfigValid = true;

      // check servers
      if (Array.isArray(this.config.servers)) {
        for (const server of this.config.servers) {
          const isValidServer = (
            server.name &&
            server.host &&
            server.port &&
            Number.isInteger(server.port)
          );
          if (!isValidServer) {
            this.log.warn('Invalid configuration for server:', server);
            isConfigValid = false;
          }
        }
      } else {
        this.log.warn('No servers were added to the plugin configuration');
        isConfigValid = false;
      }

      // check discoveryInterval
      if (!Number.isInteger(this.config.discoveryInterval)) {
        this.log.warn('discoveryInterval must be set to an integer value');
        isConfigValid = false;
      }

      if (isConfigValid === true) {
        await this.discoverDevices();
      }
    });
  }

  /**
   * This function is invoked when Homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory<RgbDeviceContext>) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const servers: RgbServer[] = this.config.servers;
    const foundServers: RgbServer[] = [];
    const foundDevices: RgbDevice[] = [];
    const foundUuids: string[] = [];

    for (const server of servers) {
      this.log.debug('Discovering devices on server:', server.name);
      await this.rgbConnection(server, (client, devices) => {
        devices.forEach(device => {
          this.log.debug('Discovered device:', device.name);
          foundDevices.push(device);
          foundServers.push(server);
        });
      });
    }

    this.log.debug('Registering devices');
    foundDevices.forEach((device, deviceIndex) => {
      const deviceServer: RgbServer = foundServers[deviceIndex];
      const uuid = this.genUuid(device);
      foundUuids.push(uuid);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);

        const colorRgb = getDeviceLedRgbColor(device);
        existingAccessory.context.device = device;
        existingAccessory.context.server = deviceServer;
        existingAccessory.context.whiteBalance = this.getDeviceWhiteBalance(deviceServer, device.name, device.location);
        if (!isLedOff(colorRgb)) {
          existingAccessory.context.lastPoweredRgbColor = colorRgb;
        }
        if (device.activeMode !== findDeviceModeId(device, 'Off')) {
          existingAccessory.context.lastPoweredModeId = device.activeMode;
        }
        this.api.updatePlatformAccessories([existingAccessory]);

        if (this.handlerUuids.indexOf(uuid) < 0) {
          this.handlerUuids.push(uuid);
          new OpenRgbPlatformAccessory(this, existingAccessory);
        }
      } else {
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory<RgbDeviceContext>(device.name || DEFAULT_DEVICE_NAME, uuid);
        this.accessories.push(accessory);

        const colorRgb = getDeviceLedRgbColor(device);
        accessory.context.device = device;
        accessory.context.server = deviceServer;
        accessory.context.whiteBalance = this.getDeviceWhiteBalance(deviceServer, device.name, device.location);
        if (!isLedOff(colorRgb)) {
          accessory.context.lastPoweredRgbColor = colorRgb;
        }
        if (device.activeMode !== findDeviceModeId(device, 'Off')) {
          accessory.context.lastPoweredModeId = device.activeMode;
        }

        if (this.handlerUuids.indexOf(uuid) < 0) {
          this.handlerUuids.push(uuid);
          new OpenRgbPlatformAccessory(this, accessory);
        }

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });

    // remove devices if their server connected but did not report them
    // (unless preserveDisconnected option is set)
    // or if the devices belong to a server that is no longer in the config
    this.accessories = this.accessories.filter(accessory => {
      const accServer: RgbServer = accessory.context.server;
      const accUuid: string = accessory.UUID;

      const serverMatch = (server: RgbServer) => (
        server.name === accServer.name &&
        server.host === accServer.host &&
        server.port === accServer.port
      );
      const isServerInConfig = !!servers.find(serverMatch);
      const isServerConnected = !!foundServers.find(serverMatch);

      if (!isServerInConfig || (isServerConnected && this.config.preserveDisconnected !== true && foundUuids.indexOf(accUuid) < 0)) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info('Removing accessory from cache:', accessory.displayName);
        return false;
      }

      return true;
    });

    if (this.config.discoveryInterval !== 0) {
      setTimeout(async () => await this.discoverDevices(), (this.config.discoveryInterval || DEFAULT_DISCOVERY_INTERVAL) * 1000);
    }
  }

  /** For generating a UUID for an RGB device from a globally unique but constant set of inputs */
  genUuid(device: RgbDevice): string {
    return this.api.hap.uuid.generate(`${device.name}-${device.serial}-${device.location}`);
  }

  /** Looks up the white balance multipliers for a device from the server's deviceConfigs.
   *  whiteBalance is a single value 0-255: 0=cool (reduce red), 128=neutral, 255=warm (reduce blue).
   */
  getDeviceWhiteBalance(server: RgbServer, deviceName: string, deviceLocation?: string): Color {
    const deviceConfig = server.deviceConfigs?.find((dc) =>
      dc.name === deviceName && (dc.location === undefined || dc.location === deviceLocation),
    );
    const wb = deviceConfig?.whiteBalance ?? 128;
    const r = wb <= 128 ? Math.round(127 + wb) : 255;
    const b = wb >= 128 ? Math.round(383 - wb) : 255;
    return [r, 255, b];
  }

  /**
   * For opening connection to OpenRGB SDK server and closing it after performing
   * the action passed as a function which receives the parameters:
   * client (the connection object) and devices (array of RGB device info)
   */
  async rgbConnection(
    server: RgbServer,
    action: (client: any, devices: RgbDevice[]) => void | Promise<void>,
  ): Promise<number> {
    const { name: serverName, host: serverHost, port: serverPort } = server;
    const client = new OpenRGB(serverName, serverPort, serverHost);

    const timeout = async () => await new Promise((resolve, reject) => setTimeout(() => reject(), SERVER_CONNECTION_TIMEOUT));

    try {
      await Promise.race([client.connect(), timeout()]);
    } catch (err) {
      const logType = this.config.suppressConnectionErrors === true ? 'debug' : 'warn';
      this.log[logType](`Unable to connect to OpenRGB SDK server at ${serverHost}:${serverPort}`);
      return 1;
    }

    const devices: RgbDevice[] = [];
    let controllerCount = 0;

    try {
      controllerCount = await client.getControllerCount();
    } catch (err) {
      this.log.warn(`Unable to enumerate RGB devices on OpenRGB SDK server at ${serverHost}:${serverPort}`);
    }

    for (let deviceId = 0; deviceId < controllerCount; deviceId++) {
      try {
        const device: RgbDevice = await client.getControllerData(deviceId);
        devices.push(device);
      } catch (err) {
        this.log.warn(`Unable to get status of RGB device ${deviceId} on OpenRGB SDK server at ${serverHost}:${serverPort}`);
      }
    }

    await action(client, devices);
    await client.disconnect();

    return 0;
  }
}
