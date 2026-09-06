<!-- repo-hero -->
<a href="https://noisemaker.app/"><img src="docs/hero.jpg" alt="Portable Portable Effects Format for Noisemaker" width="100%"></a>

<sub>Open source from <a href="https://noisefactor.io">Noise Factor</a> &middot; <a href="https://github.com/noisefactorllc">more projects</a></sub>

# Portable Effects for Noisemaker

> ⚠️ **Note:** The Portable Effects specification is still being finalized and may change.

**The Portable Effects Format** is an open standard for sharing shader effects across the Noise Factor ecosystem.

This repository serves as the **canonical source of truth** for the Portable Effects specification.

---

## What Are Portable Effects?

Portable Effects are self-contained shader packages that work across all Noise Factor applications.

---

## Creating New Effects

The easiest way to create effects is with [Foundry](https://foundry.noisedeck.app/), a web-based shader editor with live preview. You can also work directly with the files in this repository. Effects you create can be imported into Noisedeck or other Noise Factor applications.

---

## Repository Structure

```
portable/
├── effect/                     # Working example effect
│   ├── definition.json         # Effect definition
│   ├── help.md                 # Effect documentation
│   ├── glsl/
│   │   └── gradientSweep.glsl  # WebGL shader
│   └── wgsl/
│       └── gradientSweep.wgsl  # WebGPU shader
├── viewer/                     # Effect viewer
│   └── index.html              # Full-page viewer with param controls
├── docs/                       # Format specification
├── package.json                # Dev server and packaging scripts
├── package-portable.sh         # Bash packaging script
└── package-portable.mjs        # Node.js packaging script
```

---

## Quick Start

### 1. Clone This Repository

```bash
git clone https://github.com/noisefactorllc/portable.git
cd portable
```

### 2. Edit Your Effect

Modify files in the `effect/` directory:

- `definition.json` - Effect definition and parameters
- `glsl/*.glsl` - WebGL shader code
- `wgsl/*.wgsl` - WebGPU shader code
- `help.md` - Effect documentation

### 3. Test in Viewer

The viewer needs a local HTTP server. From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:2999/viewer/](http://localhost:2999/viewer/). After you change effect files, click **Reload Effect** in the viewer or refresh the page.

### 4. Package for Distribution

Create a ZIP archive for sharing or importing into applications:

```bash
# Using bash
./package-portable.sh

# Or using Node.js
npm run package
```

This creates `effect.zip`.

### 5. Import into Noisedeck

To use your effect in Noisedeck or other Noise Factor applications:

1. Open the application
2. In the menu bar, select **file** → **import effect from zip...**
3. Select your `effect.zip` file
4. The effect's DSL program will load automatically

---

## Example Effect

The included `effect/` directory contains a complete portable effect. It draws a diagonal color gradient that rotates smoothly over time. The `time` uniform controls its seamless loop.

**effect/definition.json:**
```json
{
    "name": "Gradient Sweep",
    "func": "gradientSweep",
    "description": "A diagonal color gradient that rotates over time",
    "tags": ["color"],
    "starter": true,
    "globals": {
        "speed": {
            "type": "float",
            "default": 1.0,
            "min": 0.0,
            "max": 4.0,
            "step": 0.1,
            "uniform": "speed"
        }
    },

    "defaultProgram": "search user\n\ngradientSweep(speed: 1.0)\n  .write(o0)\n\nrender(o0)",

    "passes": [
        {
            "name": "main",
            "program": "gradientSweep",
            "inputs": {},
            "outputs": {
                "color": "outputTex"
            }
        }
    ]
}
```

**effect/glsl/gradientSweep.glsl:**
```glsl
#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float speed;

out vec4 fragColor;

#define TAU 6.28318530718

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    // Rotate the gradient direction over time
    // time loops 0→1, so multiply by TAU for a full rotation per loop
    float angle = time * TAU * speed;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Project UV onto the rotating direction
    float t = dot(uv - 0.5, dir) + 0.5;

    // Map to a smooth color gradient
    vec3 color = vec3(t, t * 0.6 + 0.2, 1.0 - t);
    fragColor = vec4(color, 1.0);
}
```

---

## Minimal Effect

A portable effect needs only two files:

```
my-effect/
├── definition.json     # Effect metadata and parameters
└── glsl/               # At least one shader directory required
    └── main.glsl       # Fragment shader source
```

For full interoperability, provide both GLSL and WGSL shaders and a help.md documentation file:

```
my-effect/
├── definition.json     # Effect metadata and parameters
├── help.md             # Effect documentation
├── glsl/
│   └── main.glsl       # WebGL shader
└── wgsl/
    └── main.wgsl       # WebGPU shader
```

### definition.json

```json
{
  "name": "My Effect",
  "func": "myEffect",
  "description": "A simple shader effect",
  "starter": true,
  "tags": ["noise"],
  "globals": {
    "scale": {
      "type": "float",
      "default": 1.0,
      "min": 0.1,
      "max": 10.0
    }
  },
  "passes": [
    {
      "name": "render",
      "program": "main",
      "inputs": {},
      "outputs": { "color": "outputTex" }
    }
  ]
}
```

### glsl/main.glsl

```glsl
#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float scale;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution * scale;
    vec3 color = vec3(uv, sin(time) * 0.5 + 0.5);
    fragColor = vec4(color, 1.0);
}
```

### Using Your Effect

Once loaded into Noisedeck or another application, use it in DSL programs:

```
search user
myEffect(scale: 2.0).write(o0)
render(o0)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [**FORMAT.md**](docs/FORMAT.md) | Complete specification of the effect format |
| [**PARAMETERS.md**](docs/PARAMETERS.md) | Defining uniforms and UI controls |
| [**SHADERS.md**](docs/SHADERS.md) | Writing GLSL and WGSL shaders |
| [**DSL.md**](docs/DSL.md) | Using effects in the Polymorphic DSL |
| [**VIEWER.md**](docs/VIEWER.md) | Using the effect viewer |

---

## Effect Types

Portable effects are registered in the `user` namespace and support two types:

| Type | `starter` | Description |
|------|-----------|-------------|
| **Starter** | `true` | Generates 2D imagery from scratch (called "synth" in Noisedeck) |
| **Filter** | `false` | Transforms a 2D input texture |

The following built-in effect types are not yet supported as portable effects:

| Type | Namespace | Description |
|------|-----------|-------------|
| Mixer | `mixer` | Blends two input textures |
| 3D Starter | `synth3d` | Generates 3D volumetric data |
| 3D Filter | `filter3d` | Transforms 3D volumetric data |
| Points | `points` | Agent/particle simulations |
| Render | `render` | Rendering utilities (loops, 3D) |

---

## License

This specification is released under the MIT License.

Effects you create are your own. Share them however you like.
