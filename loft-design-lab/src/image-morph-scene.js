import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uFromAspect;
  uniform float uToAspect;
  uniform float uAspect;
  uniform float uProgress;
  uniform float uTime;
  uniform float uMotion;
  uniform vec2 uPointer;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float silkNoise(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p = rotate * p * 2.03 + vec2(5.2, 1.7);
      amplitude *= 0.47;
    }
    return value;
  }

  vec2 coverUv(vec2 uv, float imageAspect) {
    float ratio = uAspect / imageAspect;
    vec2 scale = vec2(min(1.0, ratio), min(1.0, 1.0 / ratio));
    // The artwork's subject sits right of center. Portrait crops keep it in
    // frame, then smoothly return to centered composition for wider canvases.
    float focalX = mix(0.68, 0.5, smoothstep(0.55, 1.1, uAspect));
    vec2 center = clamp(vec2(focalX, 0.5), scale * 0.5, 1.0 - scale * 0.5);
    return clamp((uv - 0.5) * scale + center, vec2(0.0005), vec2(0.9995));
  }

  vec3 fromImage(vec2 uv) { return texture2D(uFrom, coverUv(uv, uFromAspect)).rgb; }
  vec3 toImage(vec2 uv) { return texture2D(uTo, coverUv(uv, uToAspect)).rgb; }
  float luma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    // Endpoints are the exact artwork, without grain, parallax or distortion.
    // Uniform branches also avoid all the flow calculations for these stills.
    if (p <= 0.00005) {
      gl_FragColor = vec4(fromImage(vUv), 1.0);
    } else if (p >= 0.99995) {
      gl_FragColor = vec4(toImage(vUv), 1.0);
    } else if (uMotion < 0.5) {
      gl_FragColor = vec4(mix(fromImage(vUv), toImage(vUv), p), 1.0);
    } else {
      // A single broad optical wave, rather than concentric ripples. Its motion
      // vanishes at the frame edges, so even an uncropped image stays complete.
      vec2 edgeDistance = min(vUv, 1.0 - vUv);
      float edgeMask = smoothstep(0.0, 0.19, min(edgeDistance.x, edgeDistance.y));
      float envelope = pow(sin(p * 3.14159265359), 0.85);
      vec2 slowTime = vec2(uTime * 0.018, -uTime * 0.012);
      vec2 fieldUv = vUv * vec2(2.2, 2.2 / max(uAspect, 0.6));
      float n = silkNoise(fieldUv + slowTime);
      float n2 = silkNoise(fieldUv + vec2(7.4, 3.1) - slowTime * 0.7);
      vec2 uv = vUv - (vUv - 0.5) * 0.015 * envelope * edgeMask;
      // Broad, blurred lighting is a stable depth proxy. Fine artwork contours
      // never become a displacement map, which keeps the refracted image clean.
      float fromLight = luma(texture2D(uFrom, coverUv(vUv, uFromAspect), 5.5).rgb);
      float toLight = luma(texture2D(uTo, coverUv(vUv, uToAspect), 5.5).rgb);
      float lightDifference = fromLight - toLight;
      vec2 pointerFrom = uPointer * (0.3 + fromLight) * 0.022 * edgeMask * envelope;
      vec2 pointerTo = uPointer * (0.3 + toLight) * 0.022 * edgeMask * envelope;
      vec2 direction = normalize(vec2(0.88, -0.37) + (vec2(n, n2) - 0.47) * 0.65);
      vec2 tangent = vec2(-direction.y, direction.x);
      vec2 flow = (vec2(n, n2) - 0.47) * vec2(0.19, 0.15);
      flow += tangent * lightDifference * 0.045;
      flow *= edgeMask * envelope;

      float field = 0.08 + vUv.x * 0.57 + (1.0 - vUv.y) * 0.22
        + n * 0.25 + (fromLight - 0.5) * 0.08;
      float front = p * 1.5 - 0.25;
      float distanceToFront = field - front;
      float reveal = smoothstep(-0.145, 0.145, -distanceToFront);
      float blend = mix(p, reveal, 0.94);

      float lens = exp(-pow(distanceToFront / 0.15, 2.0));
      float bend = sin(distanceToFront * 13.0) * lens;
      vec2 refraction = direction * bend * 0.12 * envelope * edgeMask;
      vec2 outgoingUv = uv + pointerFrom + flow * p + refraction;
      vec2 incomingUv = uv + pointerTo - flow * (1.0 - p) - refraction;
      vec3 outgoing = fromImage(outgoingUv);
      vec3 incoming = toImage(incomingUv);
      vec3 color = mix(outgoing, incoming, blend);
      // A second shallow refraction layer gives the front the thickness of
      // curved glass. Six texture reads total, matching the previous shader.
      vec3 opticalLayer = mix(
        fromImage(outgoingUv + refraction * 0.55),
        toImage(incomingUv - refraction * 0.55), blend
      );
      color = mix(color, opticalLayer, lens * envelope * 0.18);
      float shoulder = exp(-pow((distanceToFront + 0.045) / 0.055, 2.0));
      color *= 1.0 - shoulder * envelope * edgeMask * 0.1;
      // A restrained ivory facet catches light; there is no bloom or flash.
      float facet = exp(-pow(distanceToFront / 0.007, 2.0)) * 0.022;
      float softLight = exp(-pow(distanceToFront / 0.04, 2.0)) * 0.005;
      color += vec3(0.96, 0.92, 0.84) * (facet + softLight)
        * envelope * edgeMask * (0.65 + toLight * 0.35);
      float grain = hash(floor(vUv * uResolution) + floor(uTime * 12.0)) - 0.5;
      color += grain * 0.0003 * envelope;
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
    #include <colorspace_fragment>
  }
`;

/**
 * Load local artwork and create its scroll-driven WebGL morph.
 * @param {HTMLElement} container
 * @param {string[]} imageUrls
 * @returns {Promise<{setProgress(value:number):void,setPointer(x:number,y:number):void,setPaused(value:boolean):void,dispose():void}>}
 */
export async function initImageMorph(container, imageUrls) {
  if (!(container instanceof HTMLElement)) throw new Error('Image morph requires a container element.');
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) throw new Error('Image morph requires at least two images.');

  const loader = new THREE.TextureLoader();
  // allSettled also lets us release successful textures when another image fails.
  const results = await Promise.allSettled(imageUrls.map((url) => loader.loadAsync(url)));
  const textures = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failedIndex = results.findIndex((result) => result.status === 'rejected');
  if (failedIndex !== -1) {
    textures.forEach((texture) => texture.dispose());
    throw new Error(`Could not load cinematic artwork ${failedIndex + 1}.`);
  }

  let renderer;
  let geometry;
  let material;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x0c0c0c, 1);
    renderer.debug.onShaderError = () => { throw new Error('The cinematic image shader could not be compiled.'); };
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = anisotropy;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    });

    const canvas = renderer.domElement;
    canvas.className = 'loft-morph-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aspectOf = (texture) => texture.image.width / texture.image.height;
    const uniforms = {
      uFrom: { value: textures[0] },
      uTo: { value: textures[1] },
      uFromAspect: { value: aspectOf(textures[0]) },
      uToAspect: { value: aspectOf(textures[1]) },
      uAspect: { value: 1 },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uMotion: { value: motionPreference.matches ? 0 : 1 },
      uPointer: { value: new THREE.Vector2() },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    geometry = new THREE.PlaneGeometry(2, 2);
    material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(geometry, material);
    plane.frustumCulled = false;
    scene.add(plane);

    let disposed = false;
    let paused = false;
    let visible = true;
    let contextLost = false;
    let frameId = 0;
    let previousTime = 0;
    let progress = 0;
    let targetProgress = 0;
    let selectedPair = 0;
    let slowFrames = 0;
    const targetPointer = new THREE.Vector2();
    const easedPointer = uniforms.uPointer.value;

    const updateTextures = () => {
      const scaled = progress * (textures.length - 1);
      const pair = Math.min(textures.length - 2, Math.floor(scaled));
      if (pair !== selectedPair) {
        selectedPair = pair;
        uniforms.uFrom.value = textures[pair];
        uniforms.uTo.value = textures[pair + 1];
        uniforms.uFromAspect.value = aspectOf(textures[pair]);
        uniforms.uToAspect.value = aspectOf(textures[pair + 1]);
      }
      uniforms.uProgress.value = scaled - pair;
    };

    const render = (now) => {
      frameId = 0;
      if (disposed || contextLost) return;
      const elapsed = previousTime ? (now - previousTime) / 1000 : 0;
      const dt = elapsed ? Math.min(elapsed, 0.1) : 1 / 60;
      previousTime = now;
      // Keep the optical wave responsive on slower GPUs. Only the artwork's
      // render resolution changes; text and controls retain their full detail.
      // A resumed tab starts with elapsed=0, so time spent hidden is ignored.
      if (!motionPreference.matches && visible && !document.hidden && elapsed) {
        slowFrames = elapsed > 0.055 ? slowFrames + 1 : 0;
        if (slowFrames >= 2 && renderer.getPixelRatio() > 0.6) {
          renderer.setPixelRatio(Math.max(0.6, renderer.getPixelRatio() * 0.7));
          resize(false);
          slowFrames = 0;
        }
      }
      const moving = !paused && !motionPreference.matches;
      if (moving) uniforms.uTime.value += dt;
      const ease = 1 - Math.exp(-dt * 10);
      progress = motionPreference.matches ? targetProgress : THREE.MathUtils.lerp(progress, targetProgress, ease);
      if (Math.abs(progress - targetProgress) < 0.00005) progress = targetProgress;
      easedPointer.lerp(targetPointer, ease);
      uniforms.uMotion.value = motionPreference.matches ? 0 : 1;
      updateTextures();
      renderer.render(scene, camera);
      const changing = Math.abs(progress - targetProgress) > 0.00005 || easedPointer.distanceToSquared(targetPointer) > 0.000001;
      const localProgress = uniforms.uProgress.value;
      const ambientActive = moving && localProgress > 0.00005 && localProgress < 0.99995;
      if (visible && !document.hidden && (ambientActive || changing)) frameId = requestAnimationFrame(render);
    };

    const requestRender = () => {
      if (!disposed && !contextLost && visible && !document.hidden && !frameId) {
        previousTime = 0;
        frameId = requestAnimationFrame(render);
      }
    };

    const resize = (schedule = true) => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      uniforms.uAspect.value = width / height;
      uniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
      if (schedule) requestRender();
    };

    const onVisibility = () => {
      if (document.hidden && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else requestRender();
    };
    const onMotionPreference = () => {
      if (motionPreference.matches) {
        targetPointer.set(0, 0);
        easedPointer.set(0, 0);
        progress = targetProgress;
      }
      requestRender();
    };
    const onContextLost = (event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frameId);
      frameId = 0;
    };
    const onContextRestored = () => { contextLost = false; requestRender(); };

    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestRender();
      else if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
    }, { rootMargin: '80px' });

    resize(false);
    // The first frame is complete before revealing the canvas over its fallback.
    renderer.render(scene, camera);
    container.appendChild(canvas);
    resizeObserver.observe(container);
    visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', onVisibility);
    motionPreference.addEventListener('change', onMotionPreference);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    requestRender();

    return {
      setProgress(value) {
        if (!Number.isFinite(value)) return;
        targetProgress = THREE.MathUtils.clamp(value, 0, 1);
        requestRender();
      },
      // Pointer coordinates are normalized to -1..1, with their origin at center.
      setPointer(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || motionPreference.matches) return;
        targetPointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
        requestRender();
      },
      setPaused(value) {
        paused = Boolean(value);
        requestRender();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        motionPreference.removeEventListener('change', onMotionPreference);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        geometry.dispose();
        material.dispose();
        textures.forEach((texture) => texture.dispose());
        scene.clear();
        renderer.dispose();
        canvas.remove();
      },
    };
  } catch (error) {
    geometry?.dispose();
    material?.dispose();
    textures.forEach((texture) => texture.dispose());
    renderer?.dispose();
    renderer?.domElement.remove();
    throw error;
  }
}
