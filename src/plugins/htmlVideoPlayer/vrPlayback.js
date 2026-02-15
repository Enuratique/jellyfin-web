const VrProjectionId = Object.freeze({
    Off: 'off',
    Auto: 'auto',
    HalfSideBySide: 'half-sbs',
    FullSideBySide: 'full-sbs',
    HalfTopAndBottom: 'half-tab',
    FullTopAndBottom: 'full-tab',
    FisheyeSideBySide: 'fisheye-sbs',
    FisheyeTopAndBottom: 'fisheye-tab'
});

const VR_PROJECTIONS = Object.freeze([
    {
        id: VrProjectionId.Off,
        labelKey: 'VrProjectionOff'
    },
    {
        id: VrProjectionId.Auto,
        labelKey: 'VrProjectionAuto'
    },
    {
        id: VrProjectionId.HalfSideBySide,
        labelKey: 'VrProjectionHalfSideBySide'
    },
    {
        id: VrProjectionId.FullSideBySide,
        labelKey: 'VrProjectionFullSideBySide'
    },
    {
        id: VrProjectionId.HalfTopAndBottom,
        labelKey: 'VrProjectionHalfTopAndBottom'
    },
    {
        id: VrProjectionId.FullTopAndBottom,
        labelKey: 'VrProjectionFullTopAndBottom'
    },
    {
        id: VrProjectionId.FisheyeSideBySide,
        labelKey: 'VrProjectionFisheyeSideBySide'
    },
    {
        id: VrProjectionId.FisheyeTopAndBottom,
        labelKey: 'VrProjectionFisheyeTopAndBottom'
    }
]);

const VR_PROJECTION_IDS = new Set(VR_PROJECTIONS.map(mode => mode.id));

const sideBySidePatterns = [
    /\bhsbs\b/i,
    /\bfsbs\b/i,
    /\bsbs\b/i,
    /side[\s_.-]*by[\s_.-]*side/i,
    /\bleft[\s_.-]*right\b/i,
    /\blr\b/i
];

const topBottomPatterns = [
    /\bhtab\b/i,
    /\bftab\b/i,
    /\btab\b/i,
    /\btb\b/i,
    /\bou\b/i,
    /\btop[\s_.-]*bottom\b/i,
    /\btop[\s_.-]*and[\s_.-]*bottom\b/i,
    /over[\s_.-]*under/i
];

const fullPatterns = [
    /\bfull\b/i,
    /\bfsbs\b/i,
    /\bftab\b/i
];

const fisheyePatterns = [
    /\bfisheye\b/i,
    /\bvr180\b/i,
    /\b180vr\b/i,
    /\b180[\s_.-]*(vr|fisheye)\b/i,
    /\b(vr|fisheye)[\s_.-]*180\b/i
];

function isMatch(text, patterns) {
    return patterns.some(pattern => pattern.test(text));
}

function getDetectionText(item, mediaSource) {
    return [
        item?.Video3DFormat,
        item?.Name,
        item?.OriginalTitle,
        item?.Path,
        mediaSource?.Path,
        mediaSource?.Name
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function getProjectionFromVideo3DFormat(video3DFormat) {
    switch ((video3DFormat || '').toLowerCase()) {
        case 'halfsidebyside':
            return VrProjectionId.HalfSideBySide;
        case 'fullsidebyside':
            return VrProjectionId.FullSideBySide;
        case 'halftopandbottom':
            return VrProjectionId.HalfTopAndBottom;
        case 'fulltopandbottom':
            return VrProjectionId.FullTopAndBottom;
        case 'mvc':
            // MVC is frame-packed and cannot be split from a flat decoded stream.
            return VrProjectionId.Off;
        default:
            return null;
    }
}

function resolveProjectionFromPatterns(text) {
    const hasSideBySide = isMatch(text, sideBySidePatterns);
    const hasTopBottom = isMatch(text, topBottomPatterns);
    const hasFisheye = isMatch(text, fisheyePatterns);
    const isFullLayout = isMatch(text, fullPatterns);

    if (hasFisheye && hasSideBySide) {
        return VrProjectionId.FisheyeSideBySide;
    }

    if (hasFisheye && hasTopBottom) {
        return VrProjectionId.FisheyeTopAndBottom;
    }

    if (hasSideBySide) {
        return isFullLayout ? VrProjectionId.FullSideBySide : VrProjectionId.HalfSideBySide;
    }

    if (hasTopBottom) {
        return isFullLayout ? VrProjectionId.FullTopAndBottom : VrProjectionId.HalfTopAndBottom;
    }

    return VrProjectionId.Off;
}

export function normalizeVrProjection(value) {
    if (!value) {
        return VrProjectionId.Off;
    }

    const normalized = String(value).toLowerCase();
    return VR_PROJECTION_IDS.has(normalized) ? normalized : VrProjectionId.Off;
}

export function getSupportedVrProjections() {
    return VR_PROJECTIONS;
}

export function detectVrProjection(item, mediaSource) {
    const fromMetadata = getProjectionFromVideo3DFormat(item?.Video3DFormat || mediaSource?.Video3DFormat);
    if (fromMetadata) {
        return fromMetadata;
    }

    return resolveProjectionFromPatterns(getDetectionText(item, mediaSource));
}

export function resolveVrProjection(setting, item, mediaSource) {
    const normalized = normalizeVrProjection(setting);
    if (normalized === VrProjectionId.Auto) {
        return detectVrProjection(item, mediaSource);
    }

    return normalized;
}

function getNavigatorXr() {
    if (typeof navigator === 'undefined') {
        return null;
    }

    // eslint-disable-next-line compat/compat
    return navigator.xr || null;
}

export function isImmersiveVrRuntimeAvailable() {
    return !!getNavigatorXr();
}

function applyTextureLayout(texture, layout) {
    if (!texture || !layout) {
        return;
    }

    texture.repeat.set(layout.repeatX, layout.repeatY);
    texture.offset.set(layout.offsetX, layout.offsetY);
    texture.needsUpdate = true;
}

function configureVideoTexture(THREE, texture) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;

    if ('colorSpace' in texture && 'SRGBColorSpace' in THREE) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in texture && 'sRGBEncoding' in THREE) {
        texture.encoding = THREE.sRGBEncoding;
    }
}

function drawIntoEye(ctx, videoElement, source, destination, circularMask, mirrorX = false) {
    const { sx, sy, sw, sh } = source;
    const { dx, dy, dw, dh } = destination;

    if (!circularMask && !mirrorX) {
        ctx.drawImage(videoElement, sx, sy, sw, sh, dx, dy, dw, dh);
        return;
    }

    ctx.save();

    if (circularMask) {
        const radius = Math.min(dw, dh) * 0.48;
        const centerX = dx + (dw / 2);
        const centerY = dy + (dh / 2);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();
    }

    if (mirrorX) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, dw, dh);
    } else {
        ctx.drawImage(videoElement, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    ctx.restore();
}

function drawSideBySide(ctx, videoElement, canvasWidth, canvasHeight, circularMask) {
    const sourceWidth = videoElement.videoWidth;
    const sourceHeight = videoElement.videoHeight;
    if (!sourceWidth || !sourceHeight) {
        return;
    }

    const eyeSourceWidth = sourceWidth / 2;
    const eyeDestinationWidth = canvasWidth / 2;

    drawIntoEye(
        ctx,
        videoElement,
        {
            sx: 0,
            sy: 0,
            sw: eyeSourceWidth,
            sh: sourceHeight
        },
        {
            dx: 0,
            dy: 0,
            dw: eyeDestinationWidth,
            dh: canvasHeight
        },
        circularMask
    );

    drawIntoEye(
        ctx,
        videoElement,
        {
            sx: eyeSourceWidth,
            sy: 0,
            sw: eyeSourceWidth,
            sh: sourceHeight
        },
        {
            dx: eyeDestinationWidth,
            dy: 0,
            dw: eyeDestinationWidth,
            dh: canvasHeight
        },
        circularMask
    );
}

function drawTopBottom(ctx, videoElement, canvasWidth, canvasHeight, circularMask) {
    const sourceWidth = videoElement.videoWidth;
    const sourceHeight = videoElement.videoHeight;
    if (!sourceWidth || !sourceHeight) {
        return;
    }

    const eyeSourceHeight = sourceHeight / 2;
    const eyeDestinationHeight = canvasHeight / 2;

    drawIntoEye(
        ctx,
        videoElement,
        {
            sx: 0,
            sy: 0,
            sw: sourceWidth,
            sh: eyeSourceHeight
        },
        {
            dx: 0,
            dy: 0,
            dw: canvasWidth,
            dh: eyeDestinationHeight
        },
        circularMask
    );

    drawIntoEye(
        ctx,
        videoElement,
        {
            sx: 0,
            sy: eyeSourceHeight,
            sw: sourceWidth,
            sh: eyeSourceHeight
        },
        {
            dx: 0,
            dy: eyeDestinationHeight,
            dw: canvasWidth,
            dh: eyeDestinationHeight
        },
        circularMask
    );
}

export class VrCanvasRenderer {
    #container;
    #videoElement;
    #canvas;
    #context;
    #projection = VrProjectionId.Off;
    #isRunning = false;
    #animationFrameId = null;
    #videoFrameCallbackId = null;

    constructor(container, videoElement) {
        this.#container = container;
        this.#videoElement = videoElement;

        const canvas = document.createElement('canvas');
        canvas.classList.add('htmlvideoplayer-vr-canvas', 'hide');
        canvas.setAttribute('aria-hidden', 'true');

        this.#canvas = canvas;
        this.#context = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        if (container) {
            container.appendChild(canvas);
        }
    }

    setVideoElement(videoElement) {
        if (this.#videoElement && this.#videoElement !== videoElement) {
            this.#videoElement.classList.remove('htmlvideoplayer-vr-source');
        }

        this.#videoElement = videoElement;
        this.#applyClassState();
    }

    getProjection() {
        return this.#projection;
    }

    setProjection(projection) {
        const normalized = normalizeVrProjection(projection);
        if (this.#projection === normalized) {
            return;
        }

        this.#projection = normalized;
        const isOff = normalized === VrProjectionId.Off;

        if (isOff) {
            this.#stop();
        } else {
            this.#start();
        }

        this.#applyClassState();

        if (!isOff) {
            this.#drawFrame();
        }
    }

    destroy() {
        this.#stop();

        if (this.#videoElement) {
            this.#videoElement.classList.remove('htmlvideoplayer-vr-source');
        }

        if (this.#container) {
            this.#container.classList.remove('videoPlayerContainer-vr');
        }

        if (this.#canvas?.parentNode) {
            this.#canvas.parentNode.removeChild(this.#canvas);
        }

        this.#canvas = null;
        this.#context = null;
        this.#container = null;
        this.#videoElement = null;
    }

    #applyClassState() {
        const isOff = this.#projection === VrProjectionId.Off;
        this.#canvas?.classList.toggle('hide', isOff);
        this.#container?.classList.toggle('videoPlayerContainer-vr', !isOff);
        this.#videoElement?.classList.toggle('htmlvideoplayer-vr-source', !isOff);
    }

    #start() {
        if (this.#isRunning) {
            return;
        }

        this.#isRunning = true;
    }

    #stop() {
        this.#isRunning = false;

        if (this.#animationFrameId != null) {
            cancelAnimationFrame(this.#animationFrameId);
            this.#animationFrameId = null;
        }

        if (this.#videoFrameCallbackId != null && this.#videoElement?.cancelVideoFrameCallback) {
            this.#videoElement.cancelVideoFrameCallback(this.#videoFrameCallbackId);
            this.#videoFrameCallbackId = null;
        }

        const canvas = this.#canvas;
        const ctx = this.#context;
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    #scheduleNextFrame() {
        if (!this.#isRunning) {
            return;
        }

        const videoElement = this.#videoElement;
        if (videoElement && typeof videoElement.requestVideoFrameCallback === 'function') {
            this.#videoFrameCallbackId = videoElement.requestVideoFrameCallback(() => {
                this.#videoFrameCallbackId = null;
                this.#drawFrame();
            });
            return;
        }

        this.#animationFrameId = requestAnimationFrame(() => {
            this.#animationFrameId = null;
            this.#drawFrame();
        });
    }

    #ensureCanvasSize() {
        const canvas = this.#canvas;
        if (!canvas) {
            return null;
        }

        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width * (window.devicePixelRatio || 1)));
        const height = Math.max(1, Math.round(rect.height * (window.devicePixelRatio || 1)));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        return {
            width,
            height
        };
    }

    #drawFrame() {
        if (!this.#isRunning) {
            return;
        }

        const videoElement = this.#videoElement;
        const ctx = this.#context;
        const size = this.#ensureCanvasSize();

        if (!videoElement || !ctx || !size) {
            this.#scheduleNextFrame();
            return;
        }

        const { width, height } = size;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        if (videoElement.readyState < 2) {
            this.#scheduleNextFrame();
            return;
        }

        switch (this.#projection) {
            case VrProjectionId.HalfSideBySide:
            case VrProjectionId.FullSideBySide:
                drawSideBySide(ctx, videoElement, width, height, false);
                break;
            case VrProjectionId.HalfTopAndBottom:
            case VrProjectionId.FullTopAndBottom:
                drawTopBottom(ctx, videoElement, width, height, false);
                break;
            case VrProjectionId.FisheyeSideBySide:
                drawSideBySide(ctx, videoElement, width, height, true);
                break;
            case VrProjectionId.FisheyeTopAndBottom:
                drawTopBottom(ctx, videoElement, width, height, true);
                break;
            default:
                break;
        }

        this.#scheduleNextFrame();
    }
}

const MAX_EYE_TEXTURE_SIZE = 2048;
const IMMERSIVE_HEMISPHERE_PHI_START = Math.PI;
const IMMERSIVE_SWAP_EYES = false;
const IMMERSIVE_MIRROR_X = true;
const IMMERSIVE_RIGHT_ACTION_BUTTON_INDEX = 4;
const IMMERSIVE_CONTROL_PANEL_CANVAS_WIDTH = 1024;
const IMMERSIVE_CONTROL_PANEL_CANVAS_HEIGHT = 256;
const IMMERSIVE_CONTROL_PANEL_WIDTH = 1.8;
const IMMERSIVE_CONTROL_PANEL_HEIGHT = 0.45;
const IMMERSIVE_CONTROL_PANEL_DISTANCE = 1.8;
const IMMERSIVE_CONTROL_PANEL_VERTICAL_OFFSET = -0.35;
const IMMERSIVE_CONTROL_PANEL_ENTRY_FORWARD_Y = 0.2;
const IMMERSIVE_CONTROL_PANEL_HIDE_DELAY_MS = 4500;
const IMMERSIVE_CONTROL_PANEL_FADE_DURATION_MS = 240;
const IMMERSIVE_CONTROL_PANEL_CORNER_RADIUS = 22;
const IMMERSIVE_CONTROL_PANEL_PADDING = 24;
const IMMERSIVE_CONTROL_PANEL_GAP = 16;
const IMMERSIVE_CONTROL_PANEL_BUTTON_HEIGHT = 84;
const IMMERSIVE_CONTROL_PANEL_RAY_LENGTH = 6;
const IMMERSIVE_CONTROL_PANEL_RAY_COLOR_RIGHT = 0x7ecbff;
const IMMERSIVE_CONTROL_PANEL_RAY_COLOR_LEFT = 0xffcc7e;
const IMMERSIVE_CONTROL_PANEL_RAY_COLOR_OTHER = 0xffffff;

function isTopBottomProjection(projection) {
    return projection === VrProjectionId.HalfTopAndBottom
        || projection === VrProjectionId.FullTopAndBottom
        || projection === VrProjectionId.FisheyeTopAndBottom;
}

function isMonoProjection(projection) {
    return projection === VrProjectionId.Off || projection === VrProjectionId.Auto;
}

function isFisheyeProjection(projection) {
    return projection === VrProjectionId.FisheyeSideBySide
        || projection === VrProjectionId.FisheyeTopAndBottom;
}

function hasOpaqueColor(color) {
    if (!color) {
        return false;
    }

    const normalized = String(color).replace(/\s/g, '').toLowerCase();
    return normalized !== 'transparent' && normalized !== 'rgba(0,0,0,0)';
}

function getEyeSourceSize(videoElement, projection) {
    const sourceWidth = videoElement?.videoWidth || 0;
    const sourceHeight = videoElement?.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) {
        return {
            width: 0,
            height: 0
        };
    }

    if (isMonoProjection(projection)) {
        return {
            width: sourceWidth,
            height: sourceHeight
        };
    }

    if (isTopBottomProjection(projection)) {
        return {
            width: sourceWidth,
            height: sourceHeight / 2
        };
    }

    return {
        width: sourceWidth / 2,
        height: sourceHeight
    };
}

function getEyeSourceRect(videoElement, projection, isRightEye) {
    const sourceWidth = videoElement?.videoWidth || 0;
    const sourceHeight = videoElement?.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) {
        return null;
    }

    if (isMonoProjection(projection)) {
        return {
            sx: 0,
            sy: 0,
            sw: sourceWidth,
            sh: sourceHeight
        };
    }

    if (isTopBottomProjection(projection)) {
        const eyeSourceHeight = sourceHeight / 2;
        return {
            sx: 0,
            sy: isRightEye ? eyeSourceHeight : 0,
            sw: sourceWidth,
            sh: eyeSourceHeight
        };
    }

    const eyeSourceWidth = sourceWidth / 2;
    return {
        sx: isRightEye ? eyeSourceWidth : 0,
        sy: 0,
        sw: eyeSourceWidth,
        sh: sourceHeight
    };
}

function getEyeTextureSize(videoElement, projection) {
    const sourceSize = getEyeSourceSize(videoElement, projection);
    let width = Math.max(1, Math.round(sourceSize.width));
    let height = Math.max(1, Math.round(sourceSize.height));

    const scale = Math.min(1, MAX_EYE_TEXTURE_SIZE / width, MAX_EYE_TEXTURE_SIZE / height);
    if (scale < 1) {
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
    }

    return {
        width,
        height
    };
}

function drawEyeProjection(ctx, videoElement, projection, isRightEye, width, height) {
    const source = getEyeSourceRect(videoElement, projection, isRightEye);
    if (!source) {
        return;
    }

    drawIntoEye(
        ctx,
        videoElement,
        source,
        {
            dx: 0,
            dy: 0,
            dw: width,
            dh: height
        },
        isFisheyeProjection(projection),
        IMMERSIVE_MIRROR_X
    );
}

export class VrImmersiveRenderer {
    #container;
    #videoElement;
    #projection = VrProjectionId.Off;
    #isSupported = null;
    #isRunning = false;
    #exitButtonLabel;

    #three;
    #renderer;
    #scene;
    #camera;
    #session;
    #immersiveMesh;
    #immersiveMaterial;
    #leftTexture;
    #rightTexture;
    #leftCanvas;
    #rightCanvas;
    #leftContext;
    #rightContext;
    #hemisphereGeometry;
    #exitButton;
    #hasDomOverlay = false;
    #rightEyeCamera;
    #isRightActionButtonPressed = false;
    #controlPanelMesh;
    #controlPanelMaterial;
    #controlPanelTexture;
    #controlPanelCanvas;
    #controlPanelContext;
    #controlPanelButtons = [];
    #controlPanelHoveredButtonId = null;
    #isControlPanelVisible = false;
    #controlPanelHideTimerId = null;
    #controlPanelOpacity = 0;
    #controlPanelTargetOpacity = 0;
    #lastRenderTimeMs = 0;
    #controlPanelTheme;
    #lastControlPanelPausedState;
    #raycaster;
    #panelWorldPosition;
    #panelWorldForward;
    #panelWorldTarget;
    #panelRayOrigin;
    #panelRayDirection;
    #panelRayQuaternion;
    #panelHeadPosition;
    #panelRayHitPoint;
    #controlPanelRayLines = new Map();
    #controlPanelRayGeometries = new Map();
    #controlPanelRayMaterials = new Map();
    #controlPanelRayPositions = new Map();
    #hasShownControlPanelInSession = false;

    constructor(container, videoElement, options = {}) {
        this.#container = container;
        this.#videoElement = videoElement;
        this.#exitButtonLabel = options.exitButtonLabel || 'Exit VR';
        this.#ensureExitButton();
    }

    setVideoElement(videoElement) {
        if (!videoElement || videoElement === this.#videoElement) {
            return;
        }

        this.#videoElement = videoElement;
        if (!this.#isRunning) {
            return;
        }

        this.#rebuildVideoTextures();
    }

    isActive() {
        const isPresenting = !!this.#renderer?.xr?.isPresenting;
        if (this.#isRunning && !isPresenting) {
            void this.#endActiveSession();
            return false;
        }

        return this.#isRunning && isPresenting;
    }

    getProjection() {
        return this.#projection;
    }

    async isSupported() {
        if (this.#isSupported != null) {
            return this.#isSupported;
        }

        const xr = getNavigatorXr();
        if (!xr) {
            this.#isSupported = false;
            return false;
        }

        try {
            this.#isSupported = await xr.isSessionSupported('immersive-vr');
        } catch (error) {
            console.debug('[VrImmersiveRenderer] isSessionSupported failed', error);
            this.#isSupported = false;
        }

        return this.#isSupported;
    }

    async start(projection) {
        if (this.#isRunning) {
            this.setProjection(projection);
            return true;
        }

        if (!(await this.isSupported())) {
            return false;
        }

        const xr = getNavigatorXr();
        if (!xr) {
            return false;
        }

        try {
            await this.#ensureThreeScene();

            const session = await this.#requestSession(xr);
            this.#session = session;
            this.#session.addEventListener('end', this.#onSessionEnd);
            this.#session.addEventListener('select', this.#onSessionSelect);
            this.#hasDomOverlay = !!session.domOverlayState;

            await this.#renderer.xr.setSession(session);
            this.#renderer.setAnimationLoop(this.#render);
            this.#isRunning = true;
            this.#setImmersiveUiVisible(true);
            this.setProjection(projection);
            this.#showControlPanel(true);
            return true;
        } catch (error) {
            console.error('[VrImmersiveRenderer] failed to start immersive session', error);
            this.#cleanupSessionState();
            return false;
        }
    }

    async stop() {
        if (!this.#isRunning) {
            return;
        }

        await this.#endActiveSession();
    }

    async toggle(projection) {
        if (this.#isRunning && !this.#renderer?.xr?.isPresenting) {
            await this.#endActiveSession();
        }

        if (this.#isRunning) {
            await this.stop();
            return false;
        }

        return this.start(projection);
    }

    destroy() {
        this.#cleanupSessionState();
        window.removeEventListener('resize', this.#onResize);

        if (this.#renderer?.xr) {
            this.#renderer.xr.removeEventListener('sessionend', this.#onRendererSessionEnd);
        }

        if (this.#renderer) {
            this.#renderer.dispose();

            if (this.#renderer.domElement?.parentNode) {
                this.#renderer.domElement.parentNode.removeChild(this.#renderer.domElement);
            }
        }

        if (this.#exitButton) {
            this.#exitButton.removeEventListener('click', this.#onExitButtonClick);
            if (this.#exitButton.parentNode) {
                this.#exitButton.parentNode.removeChild(this.#exitButton);
            }
        }

        if (this.#immersiveMesh) {
            this.#scene?.remove(this.#immersiveMesh);
            this.#immersiveMesh.material?.dispose();
            this.#immersiveMesh = null;
        }

        if (this.#controlPanelMesh) {
            this.#scene?.remove(this.#controlPanelMesh);
        }
        this.#controlPanelRayLines.forEach((line) => {
            this.#scene?.remove(line);
        });
        this.#controlPanelTexture?.dispose();
        this.#controlPanelMaterial?.dispose();
        this.#controlPanelMesh?.geometry?.dispose();
        this.#controlPanelRayGeometries.forEach((geometry) => {
            geometry?.dispose();
        });
        this.#controlPanelRayMaterials.forEach((material) => {
            material?.dispose();
        });
        this.#controlPanelTexture = null;
        this.#controlPanelMaterial = null;
        this.#controlPanelMesh = null;
        this.#controlPanelRayLines.clear();
        this.#controlPanelRayGeometries.clear();
        this.#controlPanelRayMaterials.clear();
        this.#controlPanelRayPositions.clear();
        this.#controlPanelCanvas = null;
        this.#controlPanelContext = null;
        this.#stopControlPanelHideTimer();

        this.#leftTexture?.dispose();
        this.#rightTexture?.dispose();
        this.#leftTexture = null;
        this.#rightTexture = null;

        this.#leftContext = null;
        this.#rightContext = null;
        this.#leftCanvas = null;
        this.#rightCanvas = null;

        this.#hemisphereGeometry?.dispose();
        this.#hemisphereGeometry = null;

        this.#three = null;
        this.#renderer = null;
        this.#scene = null;
        this.#camera = null;
        this.#immersiveMesh = null;
        this.#immersiveMaterial = null;
        this.#session = null;
        this.#videoElement = null;
        this.#exitButton = null;
        this.#hasDomOverlay = false;
        this.#rightEyeCamera = null;
        this.#isRightActionButtonPressed = false;
        this.#controlPanelButtons = [];
        this.#controlPanelHoveredButtonId = null;
        this.#isControlPanelVisible = false;
        this.#controlPanelOpacity = 0;
        this.#controlPanelTargetOpacity = 0;
        this.#lastRenderTimeMs = 0;
        this.#controlPanelTheme = null;
        this.#lastControlPanelPausedState = null;
        this.#raycaster = null;
        this.#panelWorldPosition = null;
        this.#panelWorldForward = null;
        this.#panelWorldTarget = null;
        this.#panelRayOrigin = null;
        this.#panelRayDirection = null;
        this.#panelRayQuaternion = null;
        this.#panelHeadPosition = null;
        this.#panelRayHitPoint = null;
        this.#hasShownControlPanelInSession = false;
        this.#container = null;
    }

    setProjection(projection) {
        const normalized = normalizeVrProjection(projection);
        this.#projection = normalized;

        if (!this.#leftTexture || !this.#rightTexture || !this.#immersiveMesh) {
            return;
        }

        applyTextureLayout(this.#leftTexture, {
            repeatX: 1,
            repeatY: 1,
            offsetX: 0,
            offsetY: 0
        });
        applyTextureLayout(this.#rightTexture, {
            repeatX: 1,
            repeatY: 1,
            offsetX: 0,
            offsetY: 0
        });

        this.#immersiveMesh.geometry = this.#hemisphereGeometry;

        this.#updateEyeTextures();
    }

    async #ensureThreeScene() {
        if (this.#renderer && this.#scene && this.#camera) {
            return;
        }

        const THREE = await import('three');
        this.#three = THREE;

        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true
        });
        renderer.xr.enabled = true;
        renderer.xr.addEventListener('sessionend', this.#onRendererSessionEnd);
        renderer.domElement.classList.add('htmlvideoplayer-vr-immersive-canvas');
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.#renderer = renderer;

        const size = this.#getCanvasSize();
        renderer.setSize(size.width, size.height, false);

        const scene = new THREE.Scene();
        this.#scene = scene;

        this.#raycaster = new THREE.Raycaster();
        this.#panelWorldPosition = new THREE.Vector3();
        this.#panelWorldForward = new THREE.Vector3();
        this.#panelWorldTarget = new THREE.Vector3();
        this.#panelRayOrigin = new THREE.Vector3();
        this.#panelRayDirection = new THREE.Vector3();
        this.#panelRayQuaternion = new THREE.Quaternion();
        this.#panelHeadPosition = new THREE.Vector3();
        this.#panelRayHitPoint = new THREE.Vector3();

        const camera = new THREE.PerspectiveCamera(90, size.width / size.height, 0.1, 1000);
        camera.position.set(0, 0, 0);
        this.#camera = camera;

        // Front-facing 180deg dome.
        this.#hemisphereGeometry = new THREE.SphereGeometry(50, 96, 64, IMMERSIVE_HEMISPHERE_PHI_START, Math.PI, 0, Math.PI);

        this.#rebuildVideoTextures();
        this.#ensureControlPanel();

        if (this.#container) {
            this.#container.appendChild(renderer.domElement);
        }

        window.addEventListener('resize', this.#onResize);
    }

    #rebuildVideoTextures() {
        const THREE = this.#three;
        const scene = this.#scene;
        const videoElement = this.#videoElement;
        if (!THREE || !scene || !videoElement) {
            return;
        }

        this.#ensureEyeCanvasContext();
        this.#ensureEyeCanvasSize(getEyeTextureSize(videoElement, this.#projection));

        if (this.#immersiveMesh) {
            scene.remove(this.#immersiveMesh);
            this.#immersiveMesh.material?.dispose();
        }

        this.#leftTexture?.dispose();
        this.#rightTexture?.dispose();

        const leftTexture = new THREE.CanvasTexture(this.#leftCanvas);
        const rightTexture = new THREE.CanvasTexture(this.#rightCanvas);
        configureVideoTexture(THREE, leftTexture);
        configureVideoTexture(THREE, rightTexture);
        this.#leftTexture = leftTexture;
        this.#rightTexture = rightTexture;

        const material = new THREE.MeshBasicMaterial({
            map: leftTexture,
            side: THREE.BackSide
        });
        material.depthTest = false;
        material.depthWrite = false;

        const immersiveMesh = new THREE.Mesh(this.#hemisphereGeometry, material);
        immersiveMesh.onBeforeRender = (_renderer, _scene, cameraForEye) => {
            const viewportX = cameraForEye?.viewport?.x;
            let isRightEye = false;
            if (typeof viewportX === 'number') {
                isRightEye = viewportX > 0;
            } else if (cameraForEye === this.#rightEyeCamera) {
                isRightEye = true;
            }

            if (IMMERSIVE_SWAP_EYES) {
                isRightEye = !isRightEye;
            }

            const eyeTexture = isRightEye ? this.#rightTexture : this.#leftTexture;
            if (this.#immersiveMaterial && this.#immersiveMaterial.map !== eyeTexture) {
                this.#immersiveMaterial.map = eyeTexture;
                this.#immersiveMaterial.needsUpdate = true;
            }
        };

        this.#immersiveMaterial = material;
        this.#immersiveMesh = immersiveMesh;

        scene.add(immersiveMesh);

        this.setProjection(this.#projection);
    }

    #render = (timeMs, frame) => {
        if (!this.#renderer || !this.#scene || !this.#camera || !this.#isRunning) {
            return;
        }

        if (!this.#renderer.xr.isPresenting) {
            void this.#endActiveSession();
            return;
        }

        this.#handleRightControllerActionButton();
        this.#updateEyeTextures();
        this.#updateControlPanelFade(typeof timeMs === 'number' ? timeMs : performance.now());
        this.#updateControlPanelInteraction(frame);
        this.#refreshControlPanelState();

        const xrCamera = this.#renderer.xr.getCamera(this.#camera);
        if (xrCamera?.isArrayCamera && xrCamera.cameras?.length >= 2) {
            this.#rightEyeCamera = xrCamera.cameras.find((cameraForEye) => (cameraForEye?.viewport?.x || 0) > 0) || xrCamera.cameras[1];
        } else {
            this.#rightEyeCamera = null;
        }

        this.#renderer.render(this.#scene, this.#camera);
    };

    #updateEyeTextures() {
        const videoElement = this.#videoElement;
        const leftContext = this.#leftContext;
        const rightContext = this.#rightContext;
        const leftCanvas = this.#leftCanvas;
        const rightCanvas = this.#rightCanvas;
        if (!videoElement || !leftContext || !rightContext || !leftCanvas || !rightCanvas) {
            return;
        }

        if (videoElement.readyState < 2) {
            return;
        }

        const textureSize = getEyeTextureSize(videoElement, this.#projection);
        this.#ensureEyeCanvasSize(textureSize);

        leftContext.fillStyle = '#000';
        leftContext.fillRect(0, 0, leftCanvas.width, leftCanvas.height);
        rightContext.fillStyle = '#000';
        rightContext.fillRect(0, 0, rightCanvas.width, rightCanvas.height);

        drawEyeProjection(leftContext, videoElement, this.#projection, false, leftCanvas.width, leftCanvas.height);
        drawEyeProjection(rightContext, videoElement, this.#projection, true, rightCanvas.width, rightCanvas.height);

        if (this.#leftTexture) {
            this.#leftTexture.needsUpdate = true;
        }
        if (this.#rightTexture) {
            this.#rightTexture.needsUpdate = true;
        }
    }

    async #requestSession(xr) {
        const optionalFeatures = ['local-floor', 'bounded-floor'];
        if (this.#container) {
            try {
                return await xr.requestSession('immersive-vr', {
                    optionalFeatures: optionalFeatures.concat(['dom-overlay']),
                    domOverlay: {
                        root: this.#container
                    }
                });
            } catch (error) {
                console.debug('[VrImmersiveRenderer] dom-overlay unavailable, retrying without it', error);
            }
        }

        return xr.requestSession('immersive-vr', {
            optionalFeatures
        });
    }

    #ensureEyeCanvasContext() {
        if (!this.#leftCanvas) {
            this.#leftCanvas = document.createElement('canvas');
        }
        if (!this.#rightCanvas) {
            this.#rightCanvas = document.createElement('canvas');
        }
        if (!this.#leftContext) {
            this.#leftContext = this.#leftCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
        }
        if (!this.#rightContext) {
            this.#rightContext = this.#rightCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
        }
    }

    #ensureEyeCanvasSize(size) {
        if (!size) {
            return;
        }

        const { width, height } = size;
        if (this.#leftCanvas && (this.#leftCanvas.width !== width || this.#leftCanvas.height !== height)) {
            this.#leftCanvas.width = width;
            this.#leftCanvas.height = height;
        }

        if (this.#rightCanvas && (this.#rightCanvas.width !== width || this.#rightCanvas.height !== height)) {
            this.#rightCanvas.width = width;
            this.#rightCanvas.height = height;
        }
    }

    #getCanvasSize() {
        const width = this.#container?.clientWidth || window.innerWidth || 1280;
        const height = this.#container?.clientHeight || window.innerHeight || 720;
        return {
            width: Math.max(width, 1),
            height: Math.max(height, 1)
        };
    }

    #setImmersiveUiVisible(isVisible) {
        const showOverlayUi = !!(isVisible && this.#hasDomOverlay);
        this.#container?.classList.toggle('videoPlayerContainer-vr-immersive', showOverlayUi);
        this.#exitButton?.classList.toggle('hide', !showOverlayUi);
    }

    #ensureControlPanel() {
        const THREE = this.#three;
        const scene = this.#scene;
        if (!THREE || !scene || this.#controlPanelMesh) {
            return;
        }

        const panelCanvas = document.createElement('canvas');
        panelCanvas.width = IMMERSIVE_CONTROL_PANEL_CANVAS_WIDTH;
        panelCanvas.height = IMMERSIVE_CONTROL_PANEL_CANVAS_HEIGHT;
        const panelContext = panelCanvas.getContext('2d', { alpha: true });
        if (!panelContext) {
            return;
        }

        const panelTexture = new THREE.CanvasTexture(panelCanvas);
        panelTexture.minFilter = THREE.LinearFilter;
        panelTexture.magFilter = THREE.LinearFilter;
        panelTexture.generateMipmaps = false;

        const panelMaterial = new THREE.MeshBasicMaterial({
            map: panelTexture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        panelMaterial.opacity = 0;

        const panelGeometry = new THREE.PlaneGeometry(IMMERSIVE_CONTROL_PANEL_WIDTH, IMMERSIVE_CONTROL_PANEL_HEIGHT, 1, 1);
        const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
        panelMesh.visible = false;
        panelMesh.renderOrder = 10;
        scene.add(panelMesh);

        this.#controlPanelCanvas = panelCanvas;
        this.#controlPanelContext = panelContext;
        this.#controlPanelTexture = panelTexture;
        this.#controlPanelMaterial = panelMaterial;
        this.#controlPanelMesh = panelMesh;
        this.#controlPanelOpacity = 0;
        this.#controlPanelTargetOpacity = 0;
        this.#controlPanelTheme = this.#resolveControlPanelTheme();
        this.#ensureControlPanelRay('left');
        this.#ensureControlPanelRay('right');
        this.#drawControlPanel();
    }

    #ensureControlPanelRay(handedness) {
        const THREE = this.#three;
        const scene = this.#scene;
        const rayHand = this.#getRayHandKey(handedness);
        if (!THREE || !scene || this.#controlPanelRayLines.has(rayHand)) {
            return;
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: this.#getRayColorForHand(rayHand),
            transparent: true,
            opacity: 0.85,
            depthTest: false,
            depthWrite: false
        });

        const line = new THREE.Line(geometry, material);
        line.visible = false;
        line.renderOrder = 12;
        scene.add(line);

        this.#controlPanelRayGeometries.set(rayHand, geometry);
        this.#controlPanelRayMaterials.set(rayHand, material);
        this.#controlPanelRayLines.set(rayHand, line);
        this.#controlPanelRayPositions.set(rayHand, positions);
    }

    #ensureExitButton() {
        if (!this.#container || this.#exitButton) {
            return;
        }

        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.classList.add('htmlvideoplayer-vr-immersive-exit', 'hide');
        button.textContent = this.#exitButtonLabel;
        button.addEventListener('click', this.#onExitButtonClick);
        this.#container.appendChild(button);
        this.#exitButton = button;
    }

    #onExitButtonClick = () => {
        this.stop();
    };

    #onSessionSelect = (event) => {
        if (!this.#isControlPanelVisible) {
            this.#showControlPanel(true);
            return;
        }

        const clickedButton = this.#findControlPanelButtonFromSelectEvent(event);
        if (!clickedButton) {
            this.#showControlPanel();
            return;
        }

        this.#activateControlButton(clickedButton.id);
        this.#showControlPanel();
    };

    #onResize = () => {
        if (!this.#renderer || !this.#camera) {
            return;
        }

        const size = this.#getCanvasSize();
        this.#renderer.setSize(size.width, size.height, false);
        this.#camera.aspect = size.width / size.height;
        this.#camera.updateProjectionMatrix();
    };

    #onRendererSessionEnd = () => {
        this.#cleanupSessionState();
    };

    #onSessionEnd = () => {
        this.#cleanupSessionState();
    };

    async #endActiveSession() {
        const session = this.#session;
        this.#cleanupSessionState();

        if (!session) {
            return;
        }

        try {
            await session.end();
        } catch (error) {
            console.debug('[VrImmersiveRenderer] failed to end immersive session', error);
        }
    }

    #cleanupSessionState() {
        if (!this.#isRunning && !this.#session) {
            return;
        }

        if (this.#session) {
            this.#session.removeEventListener('end', this.#onSessionEnd);
            this.#session.removeEventListener('select', this.#onSessionSelect);
        }

        if (this.#renderer) {
            this.#renderer.setAnimationLoop(null);
        }

        this.#setImmersiveUiVisible(false);
        this.#hasDomOverlay = false;
        this.#rightEyeCamera = null;
        this.#isRightActionButtonPressed = false;
        this.#hideControlPanel(true);
        this.#stopControlPanelHideTimer();
        this.#lastRenderTimeMs = 0;
        this.#hasShownControlPanelInSession = false;
        this.#session = null;
        this.#isRunning = false;
    }

    #handleRightControllerActionButton() {
        const session = this.#session;
        if (!session) {
            this.#isRightActionButtonPressed = false;
            return;
        }

        const isPressed = Array.from(session.inputSources || []).some((inputSource) => {
            if (inputSource?.handedness !== 'right') {
                return false;
            }

            const buttons = inputSource?.gamepad?.buttons;
            return !!buttons?.[IMMERSIVE_RIGHT_ACTION_BUTTON_INDEX]?.pressed;
        });

        if (isPressed && !this.#isRightActionButtonPressed) {
            this.#togglePlayPauseFromRightController();
        }

        this.#isRightActionButtonPressed = isPressed;
    }

    #togglePlayPauseFromRightController() {
        const videoElement = this.#videoElement;
        if (!videoElement) {
            return;
        }

        if (videoElement.paused) {
            void videoElement.play().catch(() => {
                // Ignore user-gesture restrictions and transient playback errors.
            });
        } else {
            videoElement.pause();
        }

        this.#showControlPanel();
    }

    #refreshControlPanelState() {
        if (!this.#isControlPanelVisible) {
            return;
        }

        const paused = !!this.#videoElement?.paused;
        if (this.#lastControlPanelPausedState !== paused) {
            this.#drawControlPanel();
        }
    }

    #showControlPanel(reposition = false) {
        if (!this.#controlPanelMesh) {
            this.#ensureControlPanel();
        }

        if (!this.#controlPanelMesh || !this.#controlPanelMaterial) {
            return;
        }

        const shouldApplyEntryPlacement = !this.#hasShownControlPanelInSession;
        if (reposition || !this.#isControlPanelVisible) {
            this.#positionControlPanelInFrontOfViewer(shouldApplyEntryPlacement);
        }

        this.#isControlPanelVisible = true;
        this.#hasShownControlPanelInSession = true;
        this.#controlPanelMesh.visible = true;
        this.#controlPanelTargetOpacity = 1;
        this.#drawControlPanel();
        this.#restartControlPanelHideTimer();
    }

    #hideControlPanel(immediate = false) {
        if (!this.#controlPanelMesh || !this.#controlPanelMaterial) {
            return;
        }

        if (!immediate && !this.#isControlPanelVisible) {
            return;
        }

        this.#isControlPanelVisible = false;
        this.#controlPanelHoveredButtonId = null;
        if (immediate) {
            this.#controlPanelTargetOpacity = 0;
            this.#controlPanelOpacity = 0;
            this.#controlPanelMaterial.opacity = 0;
            this.#controlPanelMesh.visible = false;
            this.#setAllControlPanelRaysVisible(false);
            return;
        }

        this.#controlPanelTargetOpacity = 0;
    }

    #restartControlPanelHideTimer() {
        this.#stopControlPanelHideTimer();
        this.#controlPanelHideTimerId = setTimeout(() => {
            this.#controlPanelHideTimerId = null;
            this.#hideControlPanel();
        }, IMMERSIVE_CONTROL_PANEL_HIDE_DELAY_MS);
    }

    #stopControlPanelHideTimer() {
        if (this.#controlPanelHideTimerId != null) {
            clearTimeout(this.#controlPanelHideTimerId);
            this.#controlPanelHideTimerId = null;
        }
    }

    #updateControlPanelFade(timeMs) {
        const material = this.#controlPanelMaterial;
        const mesh = this.#controlPanelMesh;
        if (!material || !mesh) {
            return;
        }

        if (this.#lastRenderTimeMs <= 0) {
            this.#lastRenderTimeMs = timeMs;
        }

        const delta = Math.max(0, timeMs - this.#lastRenderTimeMs);
        this.#lastRenderTimeMs = timeMs;

        if (Math.abs(this.#controlPanelOpacity - this.#controlPanelTargetOpacity) < 0.001) {
            material.opacity = this.#controlPanelTargetOpacity;
            this.#controlPanelOpacity = this.#controlPanelTargetOpacity;
            if (this.#controlPanelTargetOpacity <= 0) {
                mesh.visible = false;
                this.#setAllControlPanelRaysVisible(false);
            }
            return;
        }

        const fadeStep = delta / IMMERSIVE_CONTROL_PANEL_FADE_DURATION_MS;
        if (this.#controlPanelTargetOpacity > this.#controlPanelOpacity) {
            this.#controlPanelOpacity = Math.min(this.#controlPanelTargetOpacity, this.#controlPanelOpacity + fadeStep);
        } else {
            this.#controlPanelOpacity = Math.max(this.#controlPanelTargetOpacity, this.#controlPanelOpacity - fadeStep);
        }

        if (this.#controlPanelOpacity > 0.001) {
            mesh.visible = true;
        }

        material.opacity = this.#controlPanelOpacity;
    }

    #updateControlPanelInteraction(frame) {
        if (!this.#isControlPanelVisible || !this.#controlPanelMesh || !this.#controlPanelMesh.visible) {
            this.#setAllControlPanelRaysVisible(false);
            this.#setHoveredControlPanelButton(null);
            return;
        }

        const inputSources = this.#getTrackedPointerInputSources();
        if (!inputSources.length || !this.#panelRayHitPoint) {
            this.#setAllControlPanelRaysVisible(false);
            this.#setHoveredControlPanelButton(null);
            return;
        }

        let hoveredButtonId = null;
        const activeRayHands = new Set();

        inputSources.forEach((inputSource) => {
            const rayHand = this.#getRayHandKey(inputSource?.handedness);
            const hit = this.#findControlPanelHitFromInputSource(inputSource, frame);
            if (!hit?.origin || !hit?.direction) {
                this.#setControlPanelRayVisible(rayHand, false);
                return;
            }

            const endPoint = hit.point || this.#panelRayHitPoint.copy(hit.origin).addScaledVector(hit.direction, IMMERSIVE_CONTROL_PANEL_RAY_LENGTH);
            this.#setControlPanelRay(rayHand, hit.origin, endPoint);
            activeRayHands.add(rayHand);

            if (!hoveredButtonId && hit.button?.id) {
                hoveredButtonId = hit.button.id;
            }
        });

        ['left', 'right', 'other'].forEach((rayHand) => {
            if (!activeRayHands.has(rayHand)) {
                this.#setControlPanelRayVisible(rayHand, false);
            }
        });

        this.#setHoveredControlPanelButton(hoveredButtonId);
    }

    #setHoveredControlPanelButton(buttonId) {
        if (this.#controlPanelHoveredButtonId === buttonId) {
            return;
        }

        this.#controlPanelHoveredButtonId = buttonId;
        this.#drawControlPanel();
    }

    #getTrackedPointerInputSources() {
        const session = this.#session;
        if (!session) {
            return [];
        }

        const sources = Array.from(session.inputSources || []);
        return sources
            .filter((inputSource) => {
                if (!inputSource?.targetRaySpace) {
                    return false;
                }

                const targetRayMode = inputSource.targetRayMode;
                if (!targetRayMode) {
                    return true;
                }

                if (targetRayMode === 'gaze' || targetRayMode === 'screen') {
                    return false;
                }

                return targetRayMode === 'tracked-pointer' || targetRayMode === 'transient-pointer';
            })
            .sort((leftSource, rightSource) => {
                const leftHand = this.#getRayHandKey(leftSource?.handedness);
                const rightHand = this.#getRayHandKey(rightSource?.handedness);
                const order = { left: 0, right: 1, other: 2 };
                return order[leftHand] - order[rightHand];
            });
    }

    #getRayHandKey(handedness) {
        if (handedness === 'left') {
            return 'left';
        }
        if (handedness === 'right') {
            return 'right';
        }
        return 'other';
    }

    #getRayColorForHand(rayHand) {
        if (rayHand === 'left') {
            return IMMERSIVE_CONTROL_PANEL_RAY_COLOR_LEFT;
        }
        if (rayHand === 'right') {
            return IMMERSIVE_CONTROL_PANEL_RAY_COLOR_RIGHT;
        }
        return IMMERSIVE_CONTROL_PANEL_RAY_COLOR_OTHER;
    }

    #setControlPanelRayVisible(rayHand, isVisible) {
        const line = this.#controlPanelRayLines.get(rayHand);
        if (!line) {
            return;
        }

        line.visible = isVisible;
    }

    #setAllControlPanelRaysVisible(isVisible) {
        this.#controlPanelRayLines.forEach((line) => {
            line.visible = isVisible;
        });
    }

    #setControlPanelRay(rayHand, origin, end) {
        const line = this.#controlPanelRayLines.get(rayHand);
        const positions = this.#controlPanelRayPositions.get(rayHand);
        const geometry = this.#controlPanelRayGeometries.get(rayHand);
        if (!line || !positions || !geometry) {
            return;
        }

        positions[0] = origin.x;
        positions[1] = origin.y;
        positions[2] = origin.z;
        positions[3] = end.x;
        positions[4] = end.y;
        positions[5] = end.z;
        geometry.attributes.position.needsUpdate = true;
        line.visible = true;
    }

    #positionControlPanelInFrontOfViewer(useEntryPlacement = false) {
        const mesh = this.#controlPanelMesh;
        const renderer = this.#renderer;
        const camera = this.#camera;
        if (!mesh || !renderer || !camera || !this.#panelWorldPosition || !this.#panelWorldForward || !this.#panelWorldTarget || !this.#panelHeadPosition) {
            return;
        }

        const xrCamera = renderer.xr.getCamera(camera);
        if (!xrCamera) {
            return;
        }

        xrCamera.getWorldPosition(this.#panelWorldPosition);
        xrCamera.getWorldDirection(this.#panelWorldForward);
        if (useEntryPlacement) {
            this.#panelWorldForward.y = Math.max(this.#panelWorldForward.y, IMMERSIVE_CONTROL_PANEL_ENTRY_FORWARD_Y);
        } else {
            this.#panelWorldForward.y = 0;
        }
        if (this.#panelWorldForward.lengthSq() < 1e-6) {
            this.#panelWorldForward.set(0, useEntryPlacement ? IMMERSIVE_CONTROL_PANEL_ENTRY_FORWARD_Y : 0, -1);
        } else {
            this.#panelWorldForward.normalize();
        }

        mesh.position.copy(this.#panelWorldPosition)
            .addScaledVector(this.#panelWorldForward, IMMERSIVE_CONTROL_PANEL_DISTANCE);
        mesh.position.y += IMMERSIVE_CONTROL_PANEL_VERTICAL_OFFSET;

        this.#panelHeadPosition.copy(this.#panelWorldPosition);
        this.#panelHeadPosition.y += IMMERSIVE_CONTROL_PANEL_VERTICAL_OFFSET * 0.5;
        this.#panelWorldTarget.copy(this.#panelHeadPosition).sub(this.#panelWorldForward);
        mesh.lookAt(this.#panelWorldTarget);
    }

    #resolveControlPanelTheme() {
        const controlsElement = document.querySelector('#videoOsdPage .videoOsdBottom .osdControls')
            || document.querySelector('.videoOsdBottom .osdControls');
        const buttonElement = document.querySelector('#videoOsdPage .videoOsdBottom .paper-icon-button-light')
            || document.querySelector('.videoOsdBottom .paper-icon-button-light');
        const controlsStyle = controlsElement ? getComputedStyle(controlsElement) : null;
        const buttonStyle = buttonElement ? getComputedStyle(buttonElement) : null;

        const panelBackground = hasOpaqueColor(controlsStyle?.backgroundColor) ? controlsStyle.backgroundColor : 'rgba(12, 12, 12, 0.78)';
        const panelBorder = hasOpaqueColor(controlsStyle?.borderColor) ? controlsStyle.borderColor : 'rgba(255, 255, 255, 0.18)';
        const textColor = hasOpaqueColor(controlsStyle?.color) ? controlsStyle.color : '#f3f3f3';
        const buttonBackground = hasOpaqueColor(buttonStyle?.backgroundColor) ? buttonStyle.backgroundColor : 'rgba(255, 255, 255, 0.08)';
        const buttonTextColor = hasOpaqueColor(buttonStyle?.color) ? buttonStyle.color : textColor;
        const fontFamily = controlsStyle?.fontFamily || buttonStyle?.fontFamily || 'sans-serif';
        const hoverBackground = 'rgba(255, 255, 255, 0.18)';

        return {
            panelBackground,
            panelBorder,
            textColor,
            buttonBackground,
            buttonTextColor,
            fontFamily,
            hoverBackground
        };
    }

    #drawControlPanel() {
        const ctx = this.#controlPanelContext;
        const canvas = this.#controlPanelCanvas;
        const texture = this.#controlPanelTexture;
        if (!ctx || !canvas || !texture) {
            return;
        }

        this.#controlPanelTheme = this.#resolveControlPanelTheme();
        const theme = this.#controlPanelTheme;
        const width = canvas.width;
        const height = canvas.height;
        const outerRadius = IMMERSIVE_CONTROL_PANEL_CORNER_RADIUS;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = theme.panelBackground;
        ctx.strokeStyle = theme.panelBorder;
        ctx.lineWidth = 2;
        this.#drawRoundedRect(ctx, 1, 1, width - 2, height - 2, outerRadius);
        ctx.fill();
        ctx.stroke();

        const buttons = this.#buildControlPanelButtons(width, height);
        this.#controlPanelButtons = buttons;
        this.#lastControlPanelPausedState = !!this.#videoElement?.paused;

        ctx.font = `600 32px ${theme.fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const hoveredButtonId = this.#controlPanelHoveredButtonId ? String(this.#controlPanelHoveredButtonId) : '';

        buttons.forEach((button) => {
            const isHovered = hoveredButtonId === String(button.id);
            ctx.fillStyle = isHovered ? theme.hoverBackground : theme.buttonBackground;
            this.#drawRoundedRect(ctx, button.x, button.y, button.width, button.height, 14);
            ctx.fill();

            ctx.fillStyle = theme.buttonTextColor;
            ctx.fillText(button.label, button.x + (button.width / 2), button.y + (button.height / 2));
        });

        texture.needsUpdate = true;
    }

    #buildControlPanelButtons(canvasWidth, canvasHeight) {
        const videoElement = this.#videoElement;
        const isPaused = !!videoElement?.paused;
        const specs = [
            { id: 'rewind', label: '-10s' },
            { id: 'playpause', label: isPaused ? 'Play' : 'Pause' },
            { id: 'forward', label: '+10s' },
            { id: 'volumeDown', label: 'Vol-' },
            { id: 'volumeUp', label: 'Vol+' },
            { id: 'settings', label: 'Settings' },
            { id: 'exit', label: 'Exit VR' }
        ];

        const paddedWidth = canvasWidth - (IMMERSIVE_CONTROL_PANEL_PADDING * 2);
        const totalGap = (specs.length - 1) * IMMERSIVE_CONTROL_PANEL_GAP;
        const buttonWidth = Math.floor((paddedWidth - totalGap) / specs.length);
        const xOffset = Math.floor((canvasWidth - ((buttonWidth * specs.length) + totalGap)) / 2);
        const y = Math.floor((canvasHeight - IMMERSIVE_CONTROL_PANEL_BUTTON_HEIGHT) / 2);

        return specs.map((spec, index) => ({
            ...spec,
            x: xOffset + (index * (buttonWidth + IMMERSIVE_CONTROL_PANEL_GAP)),
            y,
            width: buttonWidth,
            height: IMMERSIVE_CONTROL_PANEL_BUTTON_HEIGHT
        }));
    }

    #drawRoundedRect(ctx, x, y, width, height, radius) {
        const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        ctx.beginPath();
        ctx.moveTo(x + clampedRadius, y);
        ctx.lineTo(x + width - clampedRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
        ctx.lineTo(x + width, y + height - clampedRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
        ctx.lineTo(x + clampedRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
        ctx.lineTo(x, y + clampedRadius);
        ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
        ctx.closePath();
    }

    #findControlPanelButtonFromSelectEvent(event) {
        if (!event?.inputSource || !event?.frame) {
            return null;
        }

        const hit = this.#findControlPanelHitFromInputSource(event.inputSource, event.frame);
        if (!hit) {
            return null;
        }

        this.#setHoveredControlPanelButton(hit.button?.id || null);
        return hit.button || null;
    }

    #findControlPanelHitFromInputSource(inputSource, frame) {
        const mesh = this.#controlPanelMesh;
        const raycaster = this.#raycaster;
        const renderer = this.#renderer;
        const canvas = this.#controlPanelCanvas;
        if (!mesh || !raycaster || !renderer || !canvas || !this.#panelRayOrigin || !this.#panelRayDirection || !this.#panelRayQuaternion || !inputSource?.targetRaySpace || !frame) {
            return null;
        }

        const referenceSpace = renderer.xr.getReferenceSpace();
        if (!referenceSpace) {
            return null;
        }

        const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
        if (!pose) {
            return null;
        }

        const { position, orientation } = pose.transform;
        this.#panelRayOrigin.set(position.x, position.y, position.z);
        this.#panelRayQuaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        this.#panelRayDirection.set(0, 0, -1).applyQuaternion(this.#panelRayQuaternion).normalize();

        raycaster.set(this.#panelRayOrigin, this.#panelRayDirection);
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit?.uv) {
            return {
                button: null,
                point: null,
                origin: this.#panelRayOrigin,
                direction: this.#panelRayDirection
            };
        }

        const x = hit.uv.x * canvas.width;
        const y = (1 - hit.uv.y) * canvas.height;
        const button = this.#controlPanelButtons.find((item) =>
            x >= item.x
            && x <= (item.x + item.width)
            && y >= item.y
            && y <= (item.y + item.height));

        return {
            button: button || null,
            point: hit.point || null,
            origin: this.#panelRayOrigin,
            direction: this.#panelRayDirection
        };
    }

    #activateControlButton(buttonId) {
        const videoElement = this.#videoElement;
        if (!videoElement) {
            return;
        }

        switch (buttonId) {
            case 'rewind':
                videoElement.currentTime = Math.max(0, (videoElement.currentTime || 0) - 10);
                break;
            case 'playpause':
                this.#togglePlayPauseFromRightController();
                break;
            case 'forward': {
                const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : Infinity;
                videoElement.currentTime = Math.min(duration, (videoElement.currentTime || 0) + 10);
                break;
            }
            case 'volumeDown':
                videoElement.volume = Math.max(0, (videoElement.volume || 0) - 0.1);
                break;
            case 'volumeUp':
                videoElement.volume = Math.min(1, (videoElement.volume || 0) + 0.1);
                break;
            case 'settings':
                document.querySelector('#videoOsdPage .btnVideoOsdSettings')?.click();
                break;
            case 'exit':
                void this.stop();
                break;
            default:
                break;
        }
    }
}
