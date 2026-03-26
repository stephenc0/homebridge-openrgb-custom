import { Color, OpenRgbColor, RgbDevice, RgbDeviceStates } from './rgb';

/** Gets the RGB color of the first LED on the provided device */
export function getDeviceLedRgbColor(device: RgbDevice): Color {
  const ledColor: OpenRgbColor = device?.colors?.[0];
  return [
    ledColor?.red ?? 0,
    ledColor?.green ?? 0,
    ledColor?.blue ?? 0,
  ];
}

/** Gets the HSV color that is currently represented by an accessory's state */
export function getStateHsvColor(states: RgbDeviceStates): Color {
  return [states.Hue, states.Saturation, states.Brightness];
}

/** Determines whether the provided color is black */
export function isLedOff(color: Color): boolean {
  return color[0] === 0 && color[1] === 0 && color[2] === 0;
}

/** Finds the ID of a device mode by name or returns undefined if the device has no matching mode */
export function findDeviceModeId(device: RgbDevice, modeName: string): number | undefined {
  return device.modes?.find(mode => mode.name?.trim().toLowerCase() === modeName.trim().toLowerCase())?.id;
}

/** Takes an RGB color and builds an array that can be used to set all of the given device's LEDs */
export function createDeviceLedConfig(rgbColor: Color, device: RgbDevice): OpenRgbColor[] {
  const ledColor: OpenRgbColor = {
    red: rgbColor[0],
    green: rgbColor[1],
    blue: rgbColor[2],
  };
  return Array(device.colors.length).fill(ledColor);
}

/**
 * Applies white balance multipliers to an RGB color.
 * whiteBalance channels are 0-255; 255 = full (no change), lower values reduce that channel.
 */
export function applyWhiteBalance(rgb: Color, whiteBalance: Color): Color {
  return [
    Math.min(255, Math.round(rgb[0] * whiteBalance[0] / 255)),
    Math.min(255, Math.round(rgb[1] * whiteBalance[1] / 255)),
    Math.min(255, Math.round(rgb[2] * whiteBalance[2] / 255)),
  ];
}

/**
 * Converts a color temperature in Kelvin to an approximate RGB color.
 * Based on Tanner Helland's algorithm.
 */
export function colorTemperatureToRgb(kelvin: number): Color {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    g = Math.max(0, Math.min(255, g));
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    g = Math.max(0, Math.min(255, g));
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}
