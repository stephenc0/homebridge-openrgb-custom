# homebridge-openrgb-advanced

A Homebridge plugin to control RGB lighting on your PC via [OpenRGB](https://openrgb.org/). Fork of [homebridge-openrgb](https://github.com/dbrook823/homebridge-openrgb) with added color correction, color temperature, adaptive lighting, and per-zone tuning.

## Features

- Control RGB devices (fans, RAM, motherboard, strips, keyboards, etc.) as HomeKit lights
- **Color temperature** — full mired-scale ColorTemperature characteristic
- **Adaptive Lighting** — Apple Home schedules color temperature automatically throughout the day
- **White balance correction** — warm/cool slider to fix color temperature bias, per-device and per-zone
- **Tint correction** — green/magenta slider for the perpendicular color axis, per-device and per-zone
- **Saturation scaling** — reduce vivid LED colors without affecting brightness, per-device and per-zone
- **Custom config UI** — live device discovery, identify buttons, zone sliders, live correction preview
- Multiple OpenRGB servers supported (one per PC)

## Requirements

- [OpenRGB](https://openrgb.org/) running on your PC with the **SDK Server** enabled
- Homebridge >= 1.3.0
- Node.js >= 18.0.0

### Enabling the OpenRGB SDK Server

In OpenRGB: **Settings → SDK Server → Start Server** (default port 6742). Enable "Start at launch" to have it start automatically.

## Installation

### Via Homebridge UI (recommended)

Search for `homebridge-openrgb-advanced` in the Homebridge plugin browser and install.

### Manually

```bash
sudo npm install -g https://github.com/stephenc0/homebridge-openrgb-advanced
```

## Configuration

Use the **Homebridge Config UI** to configure the plugin — it provides a live configuration interface. Open the plugin settings to:

1. Add your OpenRGB server (host, port)
2. Click **Discover Devices** to detect all connected RGB devices
3. Use the **💡 Identify** button to flash a device or zone's LEDs and confirm which one you're configuring
4. Use the **▶ Test** button to preview the current WB/tint/sat correction on the device for 3 seconds
5. Set a **device-level white balance, tint, and saturation** applied to all LEDs on that device
6. Expand **Zone overrides** to set different corrections per named zone

### Manual JSON config

```json
{
    "name": "OpenRGB Advanced",
    "platform": "OpenRgbAdvancedPlatform",
    "servers": [
        {
            "name": "My PC",
            "host": "192.168.1.100",
            "port": 6742,
            "deviceConfigs": [
                {
                    "name": "ASUS ROG STRIX B550-F",
                    "whiteBalance": 160,
                    "tint": 128,
                    "saturation": 90,
                    "zoneWhiteBalance": {
                        "D_LED1 Bottom": 140
                    },
                    "zoneTint": {
                        "D_LED1 Bottom": 120
                    },
                    "zoneSaturation": {
                        "D_LED1 Bottom": 80
                    }
                }
            ]
        }
    ],
    "discoveryInterval": 60,
    "preserveDisconnected": false,
    "suppressConnectionErrors": false
}
```

### Config options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | `"OpenRGB Advanced"` | Plugin name |
| `servers` | array | | List of OpenRGB SDK servers |
| `servers[].name` | string | | Display name for the server |
| `servers[].host` | string | | IP address or hostname of the PC |
| `servers[].port` | integer | `6742` | OpenRGB SDK server port |
| `servers[].deviceConfigs` | array | | Per-device color correction settings |
| `deviceConfigs[].whiteBalance` | integer | `128` | Device-level white balance (0=cool, 128=neutral, 255=warm) |
| `deviceConfigs[].tint` | integer | `128` | Device-level tint (0=green, 128=neutral, 255=magenta) |
| `deviceConfigs[].saturation` | integer | `100` | Device-level saturation scale in % (100=unchanged, 0=grey) |
| `deviceConfigs[].zoneWhiteBalance` | object | | Per-zone white balance overrides (zone name → 0–255) |
| `deviceConfigs[].zoneTint` | object | | Per-zone tint overrides (zone name → 0–255) |
| `deviceConfigs[].zoneSaturation` | object | | Per-zone saturation overrides (zone name → 0–100) |
| `discoveryInterval` | integer | `60` | Seconds between device discovery polls |
| `preserveDisconnected` | boolean | `false` | Keep devices in HomeKit when disconnected |
| `suppressConnectionErrors` | boolean | `false` | Hide connection error log messages |

### Color correction

All three correction axes stack: WB → tint → saturation, applied per-LED using zone overrides where configured. Zone values replace the device default for LEDs within that zone.

**White balance** (❄ ↔ ☀) adjusts the blue–orange axis:
- Cool (< 128): reduces red — useful if LEDs appear too orange/yellow
- Warm (> 128): reduces blue — useful if LEDs appear too blue/white

**Tint** (🟢 ↔ 🟣) adjusts the green–magenta axis, perpendicular to white balance:
- Green (< 128): reduces red and blue equally — useful if LEDs have a magenta cast
- Magenta (> 128): reduces green — useful if LEDs have a green cast

**Saturation scale** (0–100%) multiplies the color saturation before sending to the device:
- 100%: no change
- 0%: fully desaturated (grey/white)
- Useful for LEDs that render colors too vividly

The config UI sliders display on a −10 to +10 scale for easy cross-device matching. A tick mark on each slider shows the last-saved value so you can see drift at a glance.

## Differences from homebridge-openrgb

| Feature | homebridge-openrgb | homebridge-openrgb-advanced |
|---|---|---|
| Color (Hue/Saturation) | Yes | Yes |
| Brightness | Yes | Yes |
| Color Temperature | No | Yes |
| Adaptive Lighting | No | Yes |
| White balance correction | No | Per-device + per-zone |
| Tint correction | No | Per-device + per-zone |
| Saturation scaling | No | Per-device + per-zone |
| Config UI | Basic | Live discovery, identify, zone sliders, correction preview |

## Development

```bash
git clone https://github.com/stephenc0/homebridge-openrgb-advanced
cd homebridge-openrgb-advanced
npm install
npm run watch   # build + link + watch for changes
```
