/**
 * Asset base-path rewriter.
 *
 * The game references bundled assets with absolute paths (e.g. "/music/x.mp3",
 * "/portraits/y.png"). Those work when the app is served from the domain root,
 * but break when it is served from a sub-path (e.g. GitHub Pages project sites
 * served at "/<repo>/"). Rather than rewrite every hardcoded path in the
 * content data and every call site, we install a single set of low-level
 * interceptors that prefix requests for our known asset folders with Vite's
 * configured BASE_URL.
 *
 * In dev (BASE_URL === "/") this is a no-op, so behavior is unchanged.
 */

// BASE_URL is "/" in dev and e.g. "/Crpg-Engine-7/" for a Pages build.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

// Only rewrite paths that point at our static asset folders.
const ASSET_RE = /^\/(models|music|sfx|portraits|sprites|textures|cutscenes|title|overworld)\//;

function rewrite<T>(url: T): T {
  if (BASE && typeof url === 'string' && ASSET_RE.test(url)) {
    return (BASE + url) as unknown as T;
  }
  return url;
}

function patchSrcSetter(proto: object | undefined): void {
  if (!proto) return;
  const desc = Object.getOwnPropertyDescriptor(proto, 'src');
  if (!desc || !desc.set || !desc.get) return;
  const origSet = desc.set;
  const origGet = desc.get;
  Object.defineProperty(proto, 'src', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return origGet.call(this);
    },
    set(value: unknown) {
      origSet.call(this, rewrite(value));
    },
  });
}

export function resolveAssetUrl(url: string): string {
  return rewrite(url);
}

export function installAssetBase(): void {
  if (!BASE) return; // dev / root deploy: nothing to do

  // <img>, <audio>/<video>, <source> elements assigned via `.src = ...`
  patchSrcSetter(HTMLImageElement.prototype);
  patchSrcSetter(HTMLMediaElement.prototype);
  if (typeof HTMLSourceElement !== 'undefined') {
    patchSrcSetter(HTMLSourceElement.prototype);
  }

  // React (and three.js helpers) sometimes go through setAttribute.
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if ((name === 'src' || name === 'href') && typeof value === 'string') {
      value = rewrite(value);
    }
    return origSetAttribute.call(this, name, value);
  };

  // fetch() — used by three.js GLTFLoader / FileLoader and any direct fetches.
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string') {
      input = rewrite(input);
    } else if (input instanceof Request && ASSET_RE.test(new URL(input.url, location.href).pathname)) {
      input = new Request(rewrite(input.url), input);
    }
    return origFetch(input, init);
  };

  // XMLHttpRequest — older three.js loaders / any XHR-based asset fetches.
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    if (typeof url === 'string') {
      url = rewrite(url);
    }
    return (origOpen as any).call(this, method, url, ...rest);
  };
}
