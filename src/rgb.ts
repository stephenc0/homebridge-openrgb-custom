/** A color (e.g. an RGB or HSV color made up of its 3 channel values) */
export type Color = [number, number, number];

/** A color object as used by the OpenRGB SDK */
export interface OpenRgbColor {
    red: number;
    green: number;
    blue: number;
}

/** Describes a device as returned by the OpenRGB SDK */
export interface RgbDevice {
    deviceId: number;
    type: number;
    name: string;
    description?: string;
    version?: string;
    serial?: string;
    location: string;
    activeMode?: number;
    leds: [
        {
            name: string;
            value: OpenRgbColor;
        }
    ];
    colors: OpenRgbColor[];
    modes?: any[];
    zones?: any[];
    [key: string]: any;
}

/** Describes a device running the OpenRGB SDK server */
export interface RgbServer {
    name: string;
    host: string;
    port: number;
    deviceConfigs?: {
        name: string; location?: string;
        whiteBalance?: number; zoneWhiteBalance?: Record<string, number>;
        tint?: number; zoneTint?: Record<string, number>;
        saturation?: number; zoneSaturation?: Record<string, number>;
    }[];
}

/** State information that HomeKit keeps for accessories */
export interface RgbDeviceStates {
    On: boolean;
    Hue: number;
    Saturation: number;
    Brightness: number;
    ColorTemperature: number;  // mired (140–500)
}

/** Context information stored for accessories */
export interface RgbDeviceContext {
    device: RgbDevice;
    server: RgbServer;
    /** Per-LED white balance as RGB multiplier colors; index matches LED index. All LEDs present. */
    ledWhiteBalances: Color[];
    /** Per-LED tint as RGB multiplier colors; index matches LED index. All LEDs present. */
    ledTints: Color[];
    /** Per-LED saturation scale (0–100); index matches LED index. All LEDs present. */
    ledSaturations: number[];
    /** Persisted HomeKit characteristic state, restored on restart. */
    states?: RgbDeviceStates;
    /** Whether the last write used color temperature mode rather than HSV. */
    useColorTemp?: boolean;
    lastPoweredModeId?: number;
}
