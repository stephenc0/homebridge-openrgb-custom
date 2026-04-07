import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { AdaptiveLightingController } from 'homebridge';

import { OpenRgbPlatform } from './platform';

import { Color, OpenRgbColor, RgbDeviceContext, RgbDeviceStates } from './rgb';
import * as ColorConvert from 'color-convert';
import {
  getDeviceLedRgbColor,
  findDeviceModeId,
  isLedOff,
  getStateHsvColor,
  applyWhiteBalance,
  colorTemperatureToRgb,
} from './utils';
import { CHARACTERISTIC_UPDATE_DELAY, DEFAULT_DEVICE_NAME } from './settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class OpenRgbPlatformAccessory {
  private service: Service;
  private adaptiveLightingController: AdaptiveLightingController;

  private states: RgbDeviceStates = {
    On: false,
    Hue: 0,
    Saturation: 0,
    Brightness: 0,
    ColorTemperature: 370,  // ~2700K warm white default
  };

  // true = use ColorTemperature for next write; false = use Hue/Saturation
  private useColorTemp = false;

  constructor(
    private readonly platform: OpenRgbPlatform,
    private readonly accessory: PlatformAccessory<RgbDeviceContext>,
  ) {
    // Restore persisted characteristic state so GET handlers don't need a device connection
    if (accessory.context.states) {
      this.states = { ...accessory.context.states };
    }
    if (accessory.context.useColorTemp !== undefined) {
      this.useColorTemp = accessory.context.useColorTemp;
    }

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device?.description?.split?.(' ')?.[0] || 'OpenRGB')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.name || DEFAULT_DEVICE_NAME)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serial || '9876543210');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name || DEFAULT_DEVICE_NAME);

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // register handlers for the Hue Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    // register handlers for the Saturation Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this))
      .onGet(this.getSaturation.bind(this));

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this));

    // register handlers for the ColorTemperature Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onSet(this.setColorTemperature.bind(this))
      .onGet(this.getColorTemperature.bind(this));

    // enable Adaptive Lighting (automatic color temperature scheduling by Apple Home)
    this.adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(this.service);
    this.accessory.configureController(this.adaptiveLightingController);
  }

  /** Persists the current in-memory state to the accessory context so it survives restarts. */
  private persistState() {
    this.accessory.context.states = { ...this.states };
    this.accessory.context.useColorTemp = this.useColorTemp;
  }

  async getOn(): Promise<CharacteristicValue> {
    const isOn = await this.getLedsOn();
    this.states.On = isOn;
    this.platform.log.debug(`Get Characteristic On -> ${isOn} (${this.accessory.context.device.name})`);
    return isOn;
  }

  async getHue(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Get Characteristic Hue -> ${this.states.Hue} (${this.accessory.context.device.name})`);
    return this.states.Hue;
  }

  async getSaturation(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Get Characteristic Saturation -> ${this.states.Saturation} (${this.accessory.context.device.name})`);
    return this.states.Saturation;
  }

  async getBrightness(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Get Characteristic Brightness -> ${this.states.Brightness} (${this.accessory.context.device.name})`);
    return this.states.Brightness;
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Get Characteristic ColorTemperature -> ${this.states.ColorTemperature} (${this.accessory.context.device.name})`);
    return this.states.ColorTemperature;
  }

  /** Called to get whether the light is on or not. */
  async getLedsOn(): Promise<boolean> {
    let isOn = false;

    await this.platform.rgbConnection(this.accessory.context.server, (client, devices) => {
      const device = devices.find(d => this.platform.genUuid(d) === this.accessory.UUID);
      if (!device) {
        return;
      }
      const ledColor: OpenRgbColor = device.colors[0];
      const ledIsBlack = (ledColor.red + ledColor.green + ledColor.blue) === 0;
      const deviceModeIsOff = findDeviceModeId(device, 'Off') === device.activeMode;
      if (ledIsBlack || deviceModeIsOff) {
        isOn = false;
      } else {
        isOn = true;
      }
    });

    return isOn;
  }

  async setOn(value: CharacteristicValue) {
    const togglingPower = this.states.On !== value as boolean;
    this.states.On = value as boolean;
    this.persistState();
    await this.updateLeds(togglingPower);
    this.platform.log.debug(`Set Characteristic On -> ${value} (${this.accessory.context.device.name})`);
  }

  async setHue(value: CharacteristicValue) {
    this.states.Hue = value as number;
    this.useColorTemp = false;
    this.persistState();
    await this.updateLeds();
    this.platform.log.debug(`Set Characteristic Hue -> ${value} (${this.accessory.context.device.name})`);
  }

  async setSaturation(value: CharacteristicValue) {
    this.states.Saturation = value as number;
    this.persistState();
    await this.updateLeds();
    this.platform.log.debug(`Set Characteristic Saturation -> ${value} (${this.accessory.context.device.name})`);
  }

  async setBrightness(value: CharacteristicValue) {
    this.states.Brightness = value as number;
    this.persistState();
    await this.updateLeds();
    this.platform.log.debug(`Set Characteristic Brightness -> ${value} (${this.accessory.context.device.name})`);
  }

  async setColorTemperature(value: CharacteristicValue) {
    this.states.ColorTemperature = value as number;
    this.useColorTemp = true;
    this.persistState();
    // Only push to LEDs if the light is actually on — adaptive lighting fires
    // on startup before On/Brightness state is populated, which would black out LEDs.
    if (this.states.On) {
      await this.updateLeds();
    }
    this.platform.log.debug(`Set Characteristic ColorTemperature -> ${value} (${this.accessory.context.device.name})`);
  }

  /**
   * Called to send the new light colors to the device when the accessory state is changed in a set handler.
   * This sets all LED's on the device to the same color.
   */
  async updateLeds(togglingPower?: boolean) {
    await new Promise(resolve => setTimeout(() => resolve(0), CHARACTERISTIC_UPDATE_DELAY));

    const isOn: boolean = this.states.On;
    const { Brightness: bri, ColorTemperature: ct2 } = this.states;
    const device = this.accessory.context.device.name;
    this.platform.log.debug(`updateLeds: On=${isOn} Bri=${bri} CT=${ct2} colorTemp=${this.useColorTemp} (${device})`);

    // If the light is off and we're not actively toggling power (e.g. a scene redundantly
    // sets an already-off device to off, or a color characteristic changes while off),
    // there is nothing to send — skipping prevents spuriously switching to Direct mode.
    if (!isOn && togglingPower !== true) {
      return;
    }

    // Determine target color from current state
    let newColorRgb: Color;
    if (this.useColorTemp) {
      const kelvin = Math.round(1000000 / this.states.ColorTemperature);
      const fullRgb = colorTemperatureToRgb(kelvin);
      // Fall back to 100% brightness if state hasn't been fetched yet
      const brightness = (this.states.Brightness || 100) / 100;
      newColorRgb = [
        Math.round(fullRgb[0] * brightness),
        Math.round(fullRgb[1] * brightness),
        Math.round(fullRgb[2] * brightness),
      ];
    } else {
      newColorRgb = ColorConvert.hsv.rgb(getStateHsvColor(this.states));
    }

    let newMode: number | undefined = undefined;

    await this.platform.rgbConnection(this.accessory.context.server, async (client, devices) => {
      const device = devices.find(d => this.platform.genUuid(d) === this.accessory.UUID);
      if (!device) {
        return;
      }

      const offModeId = findDeviceModeId(device, 'Off');
      const directModeId = findDeviceModeId(device, 'Direct');
      const { lastPoweredModeId } = this.accessory.context;

      if (togglingPower === true) {
        if (isOn === true) {
          // Turning on: restore last mode; color comes from persisted this.states
          if (lastPoweredModeId !== undefined) {
            newMode = lastPoweredModeId;
          } else if (directModeId !== undefined) {
            newMode = directModeId;
          }
        } else {
          // Turning off
          if (offModeId !== undefined) {
            newMode = offModeId;
          }
          newColorRgb = [0, 0, 0];
        }
      } else if (directModeId !== undefined) {
        // Changing light color: set mode to Direct
        newMode = directModeId;
      }

      // Build per-LED colors, applying each LED's individual white balance and saturation scale
      // Recompute from live device so zone LED count changes are picked up immediately
      const liveLedWhiteBalances = this.platform.getDeviceLedWhiteBalances(this.accessory.context.server, device);
      const liveLedTints = this.platform.getDeviceLedTints(this.accessory.context.server, device);
      const liveLedSaturations = this.platform.getDeviceLedSaturations(this.accessory.context.server, device);
      const neutral: Color = [255, 255, 255];
      const newLedColors: OpenRgbColor[] = device.colors.map((_, i) => {
        if (isLedOff(newColorRgb)) {
          return { red: 0, green: 0, blue: 0 };
        }
        const satScale = (liveLedSaturations[i] ?? 100) / 100;
        const saturated: Color = [
          Math.round(255 * (1 - satScale) + newColorRgb[0] * satScale),
          Math.round(255 * (1 - satScale) + newColorRgb[1] * satScale),
          Math.round(255 * (1 - satScale) + newColorRgb[2] * satScale),
        ];
        const wb = liveLedWhiteBalances[i] ?? neutral;
        const tint = liveLedTints[i] ?? neutral;
        const finalColor = applyWhiteBalance(applyWhiteBalance(saturated, wb), tint);
        return { red: finalColor[0], green: finalColor[1], blue: finalColor[2] };
      });

      try {
        if (newMode !== undefined) {
          await client.updateMode(device.deviceId, newMode);
          if (newMode !== offModeId) {
            this.accessory.context.lastPoweredModeId = newMode;
          }
        }
        await client.updateLeds(device.deviceId, newLedColors);
      } catch (err) {
        this.platform.log.warn(`Failed to set light color on device: ${device.name} — ${err instanceof Error ? err.message : err}`);
      }
    });
  }

}
