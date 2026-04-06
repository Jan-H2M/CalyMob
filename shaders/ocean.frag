#version 460 core
#include <flutter/runtime_effect.glsl>

// Uniforms — float indices noted for Dart setFloat()
uniform vec2 u_res;          // 0, 1
uniform float u_time;        // 2
uniform float u_waveAmp;     // 3
uniform float u_waveSpeed;   // 4
uniform float u_caustics;    // 5
uniform float u_rays;        // 6
uniform float u_rayCount;    // 7
uniform vec3 u_skyTop;       // 8, 9, 10
uniform vec3 u_skyBot;       // 11, 12, 13
uniform vec3 u_waterSurf;    // 14, 15, 16
uniform vec3 u_waterDeep;    // 17, 18, 19
uniform vec4 u_sun;          // 20, 21, 22, 23  (x, y, size, intensity)
uniform float u_nightFactor; // 24

out vec4 fragColor;

// === Simplex noise ===
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289_3(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x2 = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x2) - 0.5;
  vec3 ox = floor(x2 + 0.5);
  vec3 a0 = x2 - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// === Caustics ===
float caustic(vec2 uv, float t) {
  float s = 0.0, sc = 1.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 p = uv * sc + vec2(t * 0.15 * (fi + 1.0) * 0.2, t * 0.12 * (fi + 1.0) * 0.15);
    p.x += sin(t * 0.06 + fi * 1.3) * 0.4;
    float n1 = snoise(p);
    float n2 = snoise(p + vec2(5.2, 1.3));
    s += (sin(n1 * 3.14159 + n2 * 2.5) * 0.5 + 0.5) / sc;
    sc *= 2.1;
  }
  return s * 0.2;
}

// === Sun rays ===
float sunRays(vec2 uv, float t, float wY, vec2 sunPos, float sunIntensity) {
  if (sunIntensity < 0.05) return 0.0;
  float rays = 0.0;
  vec2 sunEntry = vec2(sunPos.x, wY);
  vec2 rayDir = normalize(uv - sunEntry);
  vec2 perpDir = vec2(-rayDir.y, rayDir.x);
  float perpProj = dot(uv, perpDir);

  int count = int(u_rayCount);
  for (int i = 0; i < 10; i++) {
    if (i >= count) break;
    float fi = float(i);
    float freq = 3.0 + fi * 0.8;
    float phase = t * (0.03 + fi * 0.01) + fi * 1.9;
    float stripe = perpProj * freq + phase;
    stripe += snoise(vec2(perpProj * 2.0 + fi, t * 0.05 + fi)) * 0.35;
    float ray = pow(max(0.0, sin(stripe)), 25.0 + fi * 8.0);
    float distFromSurface = wY - uv.y;
    float depthFade = smoothstep(0.40, 0.0, distFromSurface);
    depthFade *= smoothstep(0.0, 0.03, distFromSurface);
    float horizFade = smoothstep(0.5, 0.0, abs(uv.x - sunPos.x) * 0.7);
    ray *= depthFade * horizFade;
    ray *= 0.25 / (1.0 + fi * 0.25);
    rays += ray;
  }
  return rays * sunIntensity;
}

// === Wave surface ===
// One smooth flowing curve — no noise, like a real calm ocean horizon.
float waveSurface(float x, float t) {
  float w = 0.0;
  w += sin(x * 0.8 + t * 0.3) * 0.6;      // one broad gentle swell
  w += sin(x * 1.5 + t * 0.5 + 1.2) * 0.2; // subtle secondary
  return w;
}

void main() {
  vec2 fragCoord = FlutterFragCoord().xy;
  vec2 uv = fragCoord / u_res;
  uv.y = 1.0 - uv.y;  // Flip Y: Flutter has 0=top, WebGL has 0=bottom
  float t = u_time * u_waveSpeed;
  float aspect = u_res.x / u_res.y;
  vec2 uvA = vec2(uv.x * aspect, uv.y);

  float waterLine = 0.56;
  float waveVal = waveSurface(uv.x * 6.2831, t);
  float waterY = waterLine + waveVal * u_waveAmp;
  float edgeW = 0.001;  // razor-sharp water surface edge
  float uwMask = smoothstep(waterY + edgeW, waterY - edgeW, uv.y);

  // SKY
  float skyN = clamp((uv.y - waterY) / (1.0 - waterY), 0.0, 1.0);
  vec3 sky = mix(u_skyBot, u_skyTop, skyN);

  // Sun glow
  if (u_sun.w > 0.01) {
    vec2 sunUV = vec2(u_sun.x, u_sun.y);
    float sunDist = length((uv - sunUV) * vec2(aspect, 1.0));
    float sunGlow = exp(-sunDist * sunDist / (u_sun.z * u_sun.z + 0.001)) * u_sun.w;
    vec3 sunColor = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.6, 0.3), u_nightFactor * 0.5);
    if (u_nightFactor > 0.7) sunColor = vec3(0.7, 0.75, 0.9);
    sky += sunColor * sunGlow * (1.0 - uwMask);
  }

  // UNDERWATER
  float depthN = clamp((waterY - uv.y) / waterY, 0.0, 1.0);

  vec3 water;
  if (depthN < 0.25) {
    water = u_waterSurf;
  } else if (depthN < 0.55) {
    float mt = (depthN - 0.25) / 0.3;
    vec3 midBlue = mix(u_waterSurf, u_waterDeep, 0.35);
    water = mix(u_waterSurf, midBlue, mt);
  } else {
    float dt = (depthN - 0.55) / 0.45;
    vec3 midBlue = mix(u_waterSurf, u_waterDeep, 0.35);
    water = mix(midBlue, u_waterDeep, dt);
  }

  // Organic movement
  float m1 = snoise(vec2(uv.x * 1.8 + t * 0.05, uv.y * 1.5 + t * 0.04));
  water += vec3(-0.01, 0.01, 0.02) * m1 * 0.12;

  // Caustics
  float c = caustic(uvA * 2.5, t * 0.5);
  float cMask = smoothstep(0.0, 0.4, depthN) * (1.0 - depthN) * 2.0;
  water += mix(u_waterSurf, vec3(1.0), 0.3) * c * u_caustics * cMask * 0.6;

  // Sun rays
  float rays = sunRays(uv, t, waterY, u_sun.xy, u_sun.w);
  vec3 rayColor = mix(
    mix(u_waterSurf, vec3(0.95, 0.98, 1.0), 0.6),
    vec3(1.0, 0.75, 0.4),
    smoothstep(0.3, 0.8, abs(u_sun.x - 0.5) * 2.0)
  );
  water += rayColor * rays * u_rays;

  // Night bioluminescence
  if (u_nightFactor > 0.5) {
    float bio1 = snoise(uvA * 8.0 + t * 0.1);
    float bio2 = snoise(uvA * 12.0 - t * 0.08 + 20.0);
    float bio = smoothstep(0.6, 0.9, bio1) * smoothstep(0.7, 0.95, bio2);
    water += vec3(0.2, 0.8, 0.9) * bio * (u_nightFactor - 0.5) * 2.0 * 0.15;
  }

  // Depth fog
  water = mix(water, u_waterDeep * 0.6, depthN * 0.08);

  // COMBINE — sharp edge between sky and water
  vec3 col = mix(sky, water, uwMask);

  // Stars
  if (u_nightFactor > 0.6 && uv.y > waterY + 0.05) {
    float stars = snoise(uv * 200.0);
    stars = smoothstep(0.92, 0.98, stars) * (u_nightFactor - 0.6) * 2.5;
    col += vec3(1.0) * stars * 0.6;
  }

  // Vignette
  float vig = 1.0 - 0.06 * pow(length((uv - vec2(0.5, 0.5)) * vec2(1.1, 0.85)), 2.0);
  col *= vig;

  // Tone map deep water only
  float toneDepth = smoothstep(0.15, 0.5, depthN) * uwMask;
  vec3 mapped = col / (col + 1.0) * 1.15;
  col = mix(col, mapped, toneDepth);

  fragColor = vec4(col, 1.0);
}
