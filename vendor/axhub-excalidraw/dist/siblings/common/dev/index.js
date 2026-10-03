var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// <define:import.meta.env>
var define_import_meta_env_default;
var init_define_import_meta_env = __esm({
  "<define:import.meta.env>"() {
    define_import_meta_env_default = { DEV: true };
  }
});

// ../../node_modules/es6-promise-pool/es6-promise-pool.js
var require_es6_promise_pool = __commonJS({
  "../../node_modules/es6-promise-pool/es6-promise-pool.js"(exports, module) {
    init_define_import_meta_env();
    (function(root, factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof exports === "object") {
        module.exports = factory();
      } else {
        root.PromisePool = factory();
        root.promisePool = root.PromisePool;
      }
    })(exports, function() {
      "use strict";
      var EventTarget = function() {
        this._listeners = {};
      };
      EventTarget.prototype.addEventListener = function(type, listener) {
        this._listeners[type] = this._listeners[type] || [];
        if (this._listeners[type].indexOf(listener) < 0) {
          this._listeners[type].push(listener);
        }
      };
      EventTarget.prototype.removeEventListener = function(type, listener) {
        if (this._listeners[type]) {
          var p = this._listeners[type].indexOf(listener);
          if (p >= 0) {
            this._listeners[type].splice(p, 1);
          }
        }
      };
      EventTarget.prototype.dispatchEvent = function(evt) {
        if (this._listeners[evt.type] && this._listeners[evt.type].length) {
          var listeners = this._listeners[evt.type].slice();
          for (var i = 0, l = listeners.length; i < l; ++i) {
            listeners[i].call(this, evt);
          }
        }
      };
      var isGenerator = function(func) {
        return typeof func.constructor === "function" && func.constructor.name === "GeneratorFunction";
      };
      var functionToIterator = function(func) {
        return {
          next: function() {
            var promise = func();
            return promise ? { value: promise } : { done: true };
          }
        };
      };
      var promiseToIterator = function(promise) {
        var called = false;
        return {
          next: function() {
            if (called) {
              return { done: true };
            }
            called = true;
            return { value: promise };
          }
        };
      };
      var toIterator = function(obj, Promise2) {
        var type = typeof obj;
        if (type === "object") {
          if (typeof obj.next === "function") {
            return obj;
          }
          if (typeof obj.then === "function") {
            return promiseToIterator(obj);
          }
        }
        if (type === "function") {
          return isGenerator(obj) ? obj() : functionToIterator(obj);
        }
        return promiseToIterator(Promise2.resolve(obj));
      };
      var PromisePoolEvent = function(target, type, data) {
        this.target = target;
        this.type = type;
        this.data = data;
      };
      var PromisePool2 = function(source, concurrency, options) {
        EventTarget.call(this);
        if (typeof concurrency !== "number" || Math.floor(concurrency) !== concurrency || concurrency < 1) {
          throw new Error("Invalid concurrency");
        }
        this._concurrency = concurrency;
        this._options = options || {};
        this._options.promise = this._options.promise || Promise;
        this._iterator = toIterator(source, this._options.promise);
        this._done = false;
        this._size = 0;
        this._promise = null;
        this._callbacks = null;
      };
      PromisePool2.prototype = new EventTarget();
      PromisePool2.prototype.constructor = PromisePool2;
      PromisePool2.prototype.concurrency = function(value) {
        if (typeof value !== "undefined") {
          this._concurrency = value;
          if (this.active()) {
            this._proceed();
          }
        }
        return this._concurrency;
      };
      PromisePool2.prototype.size = function() {
        return this._size;
      };
      PromisePool2.prototype.active = function() {
        return !!this._promise;
      };
      PromisePool2.prototype.promise = function() {
        return this._promise;
      };
      PromisePool2.prototype.start = function() {
        var that = this;
        var Promise2 = this._options.promise;
        this._promise = new Promise2(function(resolve, reject) {
          that._callbacks = {
            reject,
            resolve
          };
          that._proceed();
        });
        return this._promise;
      };
      PromisePool2.prototype._fireEvent = function(type, data) {
        this.dispatchEvent(new PromisePoolEvent(this, type, data));
      };
      PromisePool2.prototype._settle = function(error) {
        if (error) {
          this._callbacks.reject(error);
        } else {
          this._callbacks.resolve();
        }
        this._promise = null;
        this._callbacks = null;
      };
      PromisePool2.prototype._onPooledPromiseFulfilled = function(promise, result) {
        this._size--;
        if (this.active()) {
          this._fireEvent("fulfilled", {
            promise,
            result
          });
          this._proceed();
        }
      };
      PromisePool2.prototype._onPooledPromiseRejected = function(promise, error) {
        this._size--;
        if (this.active()) {
          this._fireEvent("rejected", {
            promise,
            error
          });
          this._settle(error || new Error("Unknown error"));
        }
      };
      PromisePool2.prototype._trackPromise = function(promise) {
        var that = this;
        promise.then(function(result) {
          that._onPooledPromiseFulfilled(promise, result);
        }, function(error) {
          that._onPooledPromiseRejected(promise, error);
        })["catch"](function(err) {
          that._settle(new Error("Promise processing failed: " + err));
        });
      };
      PromisePool2.prototype._proceed = function() {
        if (!this._done) {
          var result = { done: false };
          while (this._size < this._concurrency && !(result = this._iterator.next()).done) {
            this._size++;
            this._trackPromise(result.value);
          }
          this._done = result === null || !!result.done;
        }
        if (this._done && this._size === 0) {
          this._settle();
        }
      };
      PromisePool2.PromisePoolEvent = PromisePoolEvent;
      PromisePool2.PromisePool = PromisePool2;
      return PromisePool2;
    });
  }
});

// ../../node_modules/@braintree/sanitize-url/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/@braintree/sanitize-url/dist/index.js"(exports) {
    "use strict";
    init_define_import_meta_env();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sanitizeUrl = void 0;
    var invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im;
    var htmlEntitiesRegex = /&#(\w+)(^\w|;)?/g;
    var htmlCtrlEntityRegex = /&(newline|tab);/gi;
    var ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim;
    var urlSchemeRegex = /^.+(:|&colon;)/gim;
    var relativeFirstCharacters = [".", "/"];
    function isRelativeUrlWithoutProtocol(url) {
      return relativeFirstCharacters.indexOf(url[0]) > -1;
    }
    function decodeHtmlCharacters(str) {
      return str.replace(htmlEntitiesRegex, function(match, dec) {
        return String.fromCharCode(dec);
      });
    }
    function sanitizeUrl2(url) {
      var sanitizedUrl = decodeHtmlCharacters(url || "").replace(htmlCtrlEntityRegex, "").replace(ctrlCharactersRegex, "").trim();
      if (!sanitizedUrl) {
        return "about:blank";
      }
      if (isRelativeUrlWithoutProtocol(sanitizedUrl)) {
        return sanitizedUrl;
      }
      var urlSchemeParseResults = sanitizedUrl.match(urlSchemeRegex);
      if (!urlSchemeParseResults) {
        return sanitizedUrl;
      }
      var urlScheme = urlSchemeParseResults[0];
      if (invalidProtocolRegex.test(urlScheme)) {
        return "about:blank";
      }
      return sanitizedUrl;
    }
    exports.sanitizeUrl = sanitizeUrl2;
  }
});

// src/index.ts
init_define_import_meta_env();

// src/binary-heap.ts
init_define_import_meta_env();
var BinaryHeap = class {
  constructor(scoreFunction) {
    this.scoreFunction = scoreFunction;
  }
  content = [];
  sinkDown(idx) {
    const node = this.content[idx];
    const nodeScore = this.scoreFunction(node);
    while (idx > 0) {
      const parentN = (idx + 1 >> 1) - 1;
      const parent = this.content[parentN];
      if (nodeScore < this.scoreFunction(parent)) {
        this.content[idx] = parent;
        idx = parentN;
      } else {
        break;
      }
    }
    this.content[idx] = node;
  }
  bubbleUp(idx) {
    const length = this.content.length;
    const node = this.content[idx];
    const score = this.scoreFunction(node);
    while (true) {
      const child1N = (idx + 1 << 1) - 1;
      const child2N = child1N + 1;
      let smallestIdx = idx;
      let smallestScore = score;
      if (child1N < length) {
        const child1Score = this.scoreFunction(this.content[child1N]);
        if (child1Score < smallestScore) {
          smallestIdx = child1N;
          smallestScore = child1Score;
        }
      }
      if (child2N < length) {
        const child2Score = this.scoreFunction(this.content[child2N]);
        if (child2Score < smallestScore) {
          smallestIdx = child2N;
        }
      }
      if (smallestIdx === idx) {
        break;
      }
      this.content[idx] = this.content[smallestIdx];
      idx = smallestIdx;
    }
    this.content[idx] = node;
  }
  push(node) {
    this.content.push(node);
    this.sinkDown(this.content.length - 1);
  }
  pop() {
    if (this.content.length === 0) {
      return null;
    }
    const result = this.content[0];
    const end = this.content.pop();
    if (this.content.length > 0) {
      this.content[0] = end;
      this.bubbleUp(0);
    }
    return result;
  }
  remove(node) {
    if (this.content.length === 0) {
      return;
    }
    const i = this.content.indexOf(node);
    const end = this.content.pop();
    if (i < this.content.length) {
      this.content[i] = end;
      if (this.scoreFunction(end) < this.scoreFunction(node)) {
        this.sinkDown(i);
      } else {
        this.bubbleUp(i);
      }
    }
  }
  size() {
    return this.content.length;
  }
  rescoreElement(node) {
    this.sinkDown(this.content.indexOf(node));
  }
};

// src/bounds.ts
init_define_import_meta_env();
var isBounds = (box) => Array.isArray(box) && box.length === 4 && typeof box[0] === "number" && typeof box[1] === "number" && typeof box[2] === "number" && typeof box[3] === "number";

// src/colors.ts
init_define_import_meta_env();

// ../../node_modules/tinycolor2/esm/tinycolor.js
init_define_import_meta_env();
function _typeof(obj) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(obj2) {
    return typeof obj2;
  } : function(obj2) {
    return obj2 && "function" == typeof Symbol && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
  }, _typeof(obj);
}
var trimLeft = /^\s+/;
var trimRight = /\s+$/;
function tinycolor(color, opts) {
  color = color ? color : "";
  opts = opts || {};
  if (color instanceof tinycolor) {
    return color;
  }
  if (!(this instanceof tinycolor)) {
    return new tinycolor(color, opts);
  }
  var rgb = inputToRGB(color);
  this._originalInput = color, this._r = rgb.r, this._g = rgb.g, this._b = rgb.b, this._a = rgb.a, this._roundA = Math.round(100 * this._a) / 100, this._format = opts.format || rgb.format;
  this._gradientType = opts.gradientType;
  if (this._r < 1)
    this._r = Math.round(this._r);
  if (this._g < 1)
    this._g = Math.round(this._g);
  if (this._b < 1)
    this._b = Math.round(this._b);
  this._ok = rgb.ok;
}
tinycolor.prototype = {
  isDark: function isDark() {
    return this.getBrightness() < 128;
  },
  isLight: function isLight() {
    return !this.isDark();
  },
  isValid: function isValid() {
    return this._ok;
  },
  getOriginalInput: function getOriginalInput() {
    return this._originalInput;
  },
  getFormat: function getFormat() {
    return this._format;
  },
  getAlpha: function getAlpha() {
    return this._a;
  },
  getBrightness: function getBrightness() {
    var rgb = this.toRgb();
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1e3;
  },
  getLuminance: function getLuminance() {
    var rgb = this.toRgb();
    var RsRGB, GsRGB, BsRGB, R, G, B;
    RsRGB = rgb.r / 255;
    GsRGB = rgb.g / 255;
    BsRGB = rgb.b / 255;
    if (RsRGB <= 0.03928)
      R = RsRGB / 12.92;
    else
      R = Math.pow((RsRGB + 0.055) / 1.055, 2.4);
    if (GsRGB <= 0.03928)
      G = GsRGB / 12.92;
    else
      G = Math.pow((GsRGB + 0.055) / 1.055, 2.4);
    if (BsRGB <= 0.03928)
      B = BsRGB / 12.92;
    else
      B = Math.pow((BsRGB + 0.055) / 1.055, 2.4);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  },
  setAlpha: function setAlpha(value) {
    this._a = boundAlpha(value);
    this._roundA = Math.round(100 * this._a) / 100;
    return this;
  },
  toHsv: function toHsv() {
    var hsv = rgbToHsv(this._r, this._g, this._b);
    return {
      h: hsv.h * 360,
      s: hsv.s,
      v: hsv.v,
      a: this._a
    };
  },
  toHsvString: function toHsvString() {
    var hsv = rgbToHsv(this._r, this._g, this._b);
    var h = Math.round(hsv.h * 360), s = Math.round(hsv.s * 100), v = Math.round(hsv.v * 100);
    return this._a == 1 ? "hsv(" + h + ", " + s + "%, " + v + "%)" : "hsva(" + h + ", " + s + "%, " + v + "%, " + this._roundA + ")";
  },
  toHsl: function toHsl() {
    var hsl = rgbToHsl(this._r, this._g, this._b);
    return {
      h: hsl.h * 360,
      s: hsl.s,
      l: hsl.l,
      a: this._a
    };
  },
  toHslString: function toHslString() {
    var hsl = rgbToHsl(this._r, this._g, this._b);
    var h = Math.round(hsl.h * 360), s = Math.round(hsl.s * 100), l = Math.round(hsl.l * 100);
    return this._a == 1 ? "hsl(" + h + ", " + s + "%, " + l + "%)" : "hsla(" + h + ", " + s + "%, " + l + "%, " + this._roundA + ")";
  },
  toHex: function toHex(allow3Char) {
    return rgbToHex(this._r, this._g, this._b, allow3Char);
  },
  toHexString: function toHexString(allow3Char) {
    return "#" + this.toHex(allow3Char);
  },
  toHex8: function toHex8(allow4Char) {
    return rgbaToHex(this._r, this._g, this._b, this._a, allow4Char);
  },
  toHex8String: function toHex8String(allow4Char) {
    return "#" + this.toHex8(allow4Char);
  },
  toRgb: function toRgb() {
    return {
      r: Math.round(this._r),
      g: Math.round(this._g),
      b: Math.round(this._b),
      a: this._a
    };
  },
  toRgbString: function toRgbString() {
    return this._a == 1 ? "rgb(" + Math.round(this._r) + ", " + Math.round(this._g) + ", " + Math.round(this._b) + ")" : "rgba(" + Math.round(this._r) + ", " + Math.round(this._g) + ", " + Math.round(this._b) + ", " + this._roundA + ")";
  },
  toPercentageRgb: function toPercentageRgb() {
    return {
      r: Math.round(bound01(this._r, 255) * 100) + "%",
      g: Math.round(bound01(this._g, 255) * 100) + "%",
      b: Math.round(bound01(this._b, 255) * 100) + "%",
      a: this._a
    };
  },
  toPercentageRgbString: function toPercentageRgbString() {
    return this._a == 1 ? "rgb(" + Math.round(bound01(this._r, 255) * 100) + "%, " + Math.round(bound01(this._g, 255) * 100) + "%, " + Math.round(bound01(this._b, 255) * 100) + "%)" : "rgba(" + Math.round(bound01(this._r, 255) * 100) + "%, " + Math.round(bound01(this._g, 255) * 100) + "%, " + Math.round(bound01(this._b, 255) * 100) + "%, " + this._roundA + ")";
  },
  toName: function toName() {
    if (this._a === 0) {
      return "transparent";
    }
    if (this._a < 1) {
      return false;
    }
    return hexNames[rgbToHex(this._r, this._g, this._b, true)] || false;
  },
  toFilter: function toFilter(secondColor) {
    var hex8String = "#" + rgbaToArgbHex(this._r, this._g, this._b, this._a);
    var secondHex8String = hex8String;
    var gradientType = this._gradientType ? "GradientType = 1, " : "";
    if (secondColor) {
      var s = tinycolor(secondColor);
      secondHex8String = "#" + rgbaToArgbHex(s._r, s._g, s._b, s._a);
    }
    return "progid:DXImageTransform.Microsoft.gradient(" + gradientType + "startColorstr=" + hex8String + ",endColorstr=" + secondHex8String + ")";
  },
  toString: function toString(format) {
    var formatSet = !!format;
    format = format || this._format;
    var formattedString = false;
    var hasAlpha = this._a < 1 && this._a >= 0;
    var needsAlphaFormat = !formatSet && hasAlpha && (format === "hex" || format === "hex6" || format === "hex3" || format === "hex4" || format === "hex8" || format === "name");
    if (needsAlphaFormat) {
      if (format === "name" && this._a === 0) {
        return this.toName();
      }
      return this.toRgbString();
    }
    if (format === "rgb") {
      formattedString = this.toRgbString();
    }
    if (format === "prgb") {
      formattedString = this.toPercentageRgbString();
    }
    if (format === "hex" || format === "hex6") {
      formattedString = this.toHexString();
    }
    if (format === "hex3") {
      formattedString = this.toHexString(true);
    }
    if (format === "hex4") {
      formattedString = this.toHex8String(true);
    }
    if (format === "hex8") {
      formattedString = this.toHex8String();
    }
    if (format === "name") {
      formattedString = this.toName();
    }
    if (format === "hsl") {
      formattedString = this.toHslString();
    }
    if (format === "hsv") {
      formattedString = this.toHsvString();
    }
    return formattedString || this.toHexString();
  },
  clone: function clone() {
    return tinycolor(this.toString());
  },
  _applyModification: function _applyModification(fn, args) {
    var color = fn.apply(null, [this].concat([].slice.call(args)));
    this._r = color._r;
    this._g = color._g;
    this._b = color._b;
    this.setAlpha(color._a);
    return this;
  },
  lighten: function lighten() {
    return this._applyModification(_lighten, arguments);
  },
  brighten: function brighten() {
    return this._applyModification(_brighten, arguments);
  },
  darken: function darken() {
    return this._applyModification(_darken, arguments);
  },
  desaturate: function desaturate() {
    return this._applyModification(_desaturate, arguments);
  },
  saturate: function saturate() {
    return this._applyModification(_saturate, arguments);
  },
  greyscale: function greyscale() {
    return this._applyModification(_greyscale, arguments);
  },
  spin: function spin() {
    return this._applyModification(_spin, arguments);
  },
  _applyCombination: function _applyCombination(fn, args) {
    return fn.apply(null, [this].concat([].slice.call(args)));
  },
  analogous: function analogous() {
    return this._applyCombination(_analogous, arguments);
  },
  complement: function complement() {
    return this._applyCombination(_complement, arguments);
  },
  monochromatic: function monochromatic() {
    return this._applyCombination(_monochromatic, arguments);
  },
  splitcomplement: function splitcomplement() {
    return this._applyCombination(_splitcomplement, arguments);
  },
  // Disabled until https://github.com/bgrins/TinyColor/issues/254
  // polyad: function (number) {
  //   return this._applyCombination(polyad, [number]);
  // },
  triad: function triad() {
    return this._applyCombination(polyad, [3]);
  },
  tetrad: function tetrad() {
    return this._applyCombination(polyad, [4]);
  }
};
tinycolor.fromRatio = function(color, opts) {
  if (_typeof(color) == "object") {
    var newColor = {};
    for (var i in color) {
      if (color.hasOwnProperty(i)) {
        if (i === "a") {
          newColor[i] = color[i];
        } else {
          newColor[i] = convertToPercentage(color[i]);
        }
      }
    }
    color = newColor;
  }
  return tinycolor(color, opts);
};
function inputToRGB(color) {
  var rgb = {
    r: 0,
    g: 0,
    b: 0
  };
  var a = 1;
  var s = null;
  var v = null;
  var l = null;
  var ok = false;
  var format = false;
  if (typeof color == "string") {
    color = stringInputToObject(color);
  }
  if (_typeof(color) == "object") {
    if (isValidCSSUnit(color.r) && isValidCSSUnit(color.g) && isValidCSSUnit(color.b)) {
      rgb = rgbToRgb(color.r, color.g, color.b);
      ok = true;
      format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
    } else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.v)) {
      s = convertToPercentage(color.s);
      v = convertToPercentage(color.v);
      rgb = hsvToRgb(color.h, s, v);
      ok = true;
      format = "hsv";
    } else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.l)) {
      s = convertToPercentage(color.s);
      l = convertToPercentage(color.l);
      rgb = hslToRgb(color.h, s, l);
      ok = true;
      format = "hsl";
    }
    if (color.hasOwnProperty("a")) {
      a = color.a;
    }
  }
  a = boundAlpha(a);
  return {
    ok,
    format: color.format || format,
    r: Math.min(255, Math.max(rgb.r, 0)),
    g: Math.min(255, Math.max(rgb.g, 0)),
    b: Math.min(255, Math.max(rgb.b, 0)),
    a
  };
}
function rgbToRgb(r, g, b) {
  return {
    r: bound01(r, 255) * 255,
    g: bound01(g, 255) * 255,
    b: bound01(b, 255) * 255
  };
}
function rgbToHsl(r, g, b) {
  r = bound01(r, 255);
  g = bound01(g, 255);
  b = bound01(b, 255);
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;
  if (max == min) {
    h = s = 0;
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h,
    s,
    l
  };
}
function hslToRgb(h, s, l) {
  var r, g, b;
  h = bound01(h, 360);
  s = bound01(s, 100);
  l = bound01(l, 100);
  function hue2rgb(p2, q2, t) {
    if (t < 0)
      t += 1;
    if (t > 1)
      t -= 1;
    if (t < 1 / 6)
      return p2 + (q2 - p2) * 6 * t;
    if (t < 1 / 2)
      return q2;
    if (t < 2 / 3)
      return p2 + (q2 - p2) * (2 / 3 - t) * 6;
    return p2;
  }
  if (s === 0) {
    r = g = b = l;
  } else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: r * 255,
    g: g * 255,
    b: b * 255
  };
}
function rgbToHsv(r, g, b) {
  r = bound01(r, 255);
  g = bound01(g, 255);
  b = bound01(b, 255);
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, v = max;
  var d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max == min) {
    h = 0;
  } else {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h,
    s,
    v
  };
}
function hsvToRgb(h, s, v) {
  h = bound01(h, 360) * 6;
  s = bound01(s, 100);
  v = bound01(v, 100);
  var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), mod = i % 6, r = [v, q, p, p, t, v][mod], g = [t, v, v, q, p, p][mod], b = [p, p, t, v, v, q][mod];
  return {
    r: r * 255,
    g: g * 255,
    b: b * 255
  };
}
function rgbToHex(r, g, b, allow3Char) {
  var hex = [pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16))];
  if (allow3Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
    return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
  }
  return hex.join("");
}
function rgbaToHex(r, g, b, a, allow4Char) {
  var hex = [pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16)), pad2(convertDecimalToHex(a))];
  if (allow4Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1) && hex[3].charAt(0) == hex[3].charAt(1)) {
    return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0) + hex[3].charAt(0);
  }
  return hex.join("");
}
function rgbaToArgbHex(r, g, b, a) {
  var hex = [pad2(convertDecimalToHex(a)), pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16))];
  return hex.join("");
}
tinycolor.equals = function(color1, color2) {
  if (!color1 || !color2)
    return false;
  return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
};
tinycolor.random = function() {
  return tinycolor.fromRatio({
    r: Math.random(),
    g: Math.random(),
    b: Math.random()
  });
};
function _desaturate(color, amount) {
  amount = amount === 0 ? 0 : amount || 10;
  var hsl = tinycolor(color).toHsl();
  hsl.s -= amount / 100;
  hsl.s = clamp01(hsl.s);
  return tinycolor(hsl);
}
function _saturate(color, amount) {
  amount = amount === 0 ? 0 : amount || 10;
  var hsl = tinycolor(color).toHsl();
  hsl.s += amount / 100;
  hsl.s = clamp01(hsl.s);
  return tinycolor(hsl);
}
function _greyscale(color) {
  return tinycolor(color).desaturate(100);
}
function _lighten(color, amount) {
  amount = amount === 0 ? 0 : amount || 10;
  var hsl = tinycolor(color).toHsl();
  hsl.l += amount / 100;
  hsl.l = clamp01(hsl.l);
  return tinycolor(hsl);
}
function _brighten(color, amount) {
  amount = amount === 0 ? 0 : amount || 10;
  var rgb = tinycolor(color).toRgb();
  rgb.r = Math.max(0, Math.min(255, rgb.r - Math.round(255 * -(amount / 100))));
  rgb.g = Math.max(0, Math.min(255, rgb.g - Math.round(255 * -(amount / 100))));
  rgb.b = Math.max(0, Math.min(255, rgb.b - Math.round(255 * -(amount / 100))));
  return tinycolor(rgb);
}
function _darken(color, amount) {
  amount = amount === 0 ? 0 : amount || 10;
  var hsl = tinycolor(color).toHsl();
  hsl.l -= amount / 100;
  hsl.l = clamp01(hsl.l);
  return tinycolor(hsl);
}
function _spin(color, amount) {
  var hsl = tinycolor(color).toHsl();
  var hue = (hsl.h + amount) % 360;
  hsl.h = hue < 0 ? 360 + hue : hue;
  return tinycolor(hsl);
}
function _complement(color) {
  var hsl = tinycolor(color).toHsl();
  hsl.h = (hsl.h + 180) % 360;
  return tinycolor(hsl);
}
function polyad(color, number) {
  if (isNaN(number) || number <= 0) {
    throw new Error("Argument to polyad must be a positive number");
  }
  var hsl = tinycolor(color).toHsl();
  var result = [tinycolor(color)];
  var step = 360 / number;
  for (var i = 1; i < number; i++) {
    result.push(tinycolor({
      h: (hsl.h + i * step) % 360,
      s: hsl.s,
      l: hsl.l
    }));
  }
  return result;
}
function _splitcomplement(color) {
  var hsl = tinycolor(color).toHsl();
  var h = hsl.h;
  return [tinycolor(color), tinycolor({
    h: (h + 72) % 360,
    s: hsl.s,
    l: hsl.l
  }), tinycolor({
    h: (h + 216) % 360,
    s: hsl.s,
    l: hsl.l
  })];
}
function _analogous(color, results, slices) {
  results = results || 6;
  slices = slices || 30;
  var hsl = tinycolor(color).toHsl();
  var part = 360 / slices;
  var ret = [tinycolor(color)];
  for (hsl.h = (hsl.h - (part * results >> 1) + 720) % 360; --results; ) {
    hsl.h = (hsl.h + part) % 360;
    ret.push(tinycolor(hsl));
  }
  return ret;
}
function _monochromatic(color, results) {
  results = results || 6;
  var hsv = tinycolor(color).toHsv();
  var h = hsv.h, s = hsv.s, v = hsv.v;
  var ret = [];
  var modification = 1 / results;
  while (results--) {
    ret.push(tinycolor({
      h,
      s,
      v
    }));
    v = (v + modification) % 1;
  }
  return ret;
}
tinycolor.mix = function(color1, color2, amount) {
  amount = amount === 0 ? 0 : amount || 50;
  var rgb1 = tinycolor(color1).toRgb();
  var rgb2 = tinycolor(color2).toRgb();
  var p = amount / 100;
  var rgba = {
    r: (rgb2.r - rgb1.r) * p + rgb1.r,
    g: (rgb2.g - rgb1.g) * p + rgb1.g,
    b: (rgb2.b - rgb1.b) * p + rgb1.b,
    a: (rgb2.a - rgb1.a) * p + rgb1.a
  };
  return tinycolor(rgba);
};
tinycolor.readability = function(color1, color2) {
  var c1 = tinycolor(color1);
  var c2 = tinycolor(color2);
  return (Math.max(c1.getLuminance(), c2.getLuminance()) + 0.05) / (Math.min(c1.getLuminance(), c2.getLuminance()) + 0.05);
};
tinycolor.isReadable = function(color1, color2, wcag2) {
  var readability = tinycolor.readability(color1, color2);
  var wcag2Parms, out;
  out = false;
  wcag2Parms = validateWCAG2Parms(wcag2);
  switch (wcag2Parms.level + wcag2Parms.size) {
    case "AAsmall":
    case "AAAlarge":
      out = readability >= 4.5;
      break;
    case "AAlarge":
      out = readability >= 3;
      break;
    case "AAAsmall":
      out = readability >= 7;
      break;
  }
  return out;
};
tinycolor.mostReadable = function(baseColor, colorList, args) {
  var bestColor = null;
  var bestScore = 0;
  var readability;
  var includeFallbackColors, level, size;
  args = args || {};
  includeFallbackColors = args.includeFallbackColors;
  level = args.level;
  size = args.size;
  for (var i = 0; i < colorList.length; i++) {
    readability = tinycolor.readability(baseColor, colorList[i]);
    if (readability > bestScore) {
      bestScore = readability;
      bestColor = tinycolor(colorList[i]);
    }
  }
  if (tinycolor.isReadable(baseColor, bestColor, {
    level,
    size
  }) || !includeFallbackColors) {
    return bestColor;
  } else {
    args.includeFallbackColors = false;
    return tinycolor.mostReadable(baseColor, ["#fff", "#000"], args);
  }
};
var names = tinycolor.names = {
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aqua: "0ff",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  black: "000",
  blanchedalmond: "ffebcd",
  blue: "00f",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  burntsienna: "ea7e5d",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  cyan: "0ff",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgreen: "006400",
  darkgrey: "a9a9a9",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkslategrey: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  fuchsia: "f0f",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  gray: "808080",
  green: "008000",
  greenyellow: "adff2f",
  grey: "808080",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgreen: "90ee90",
  lightgrey: "d3d3d3",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "789",
  lightslategrey: "789",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  lime: "0f0",
  limegreen: "32cd32",
  linen: "faf0e6",
  magenta: "f0f",
  maroon: "800000",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  navy: "000080",
  oldlace: "fdf5e6",
  olive: "808000",
  olivedrab: "6b8e23",
  orange: "ffa500",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "f00",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  silver: "c0c0c0",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  slategrey: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  teal: "008080",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  white: "fff",
  whitesmoke: "f5f5f5",
  yellow: "ff0",
  yellowgreen: "9acd32"
};
var hexNames = tinycolor.hexNames = flip(names);
function flip(o) {
  var flipped = {};
  for (var i in o) {
    if (o.hasOwnProperty(i)) {
      flipped[o[i]] = i;
    }
  }
  return flipped;
}
function boundAlpha(a) {
  a = parseFloat(a);
  if (isNaN(a) || a < 0 || a > 1) {
    a = 1;
  }
  return a;
}
function bound01(n, max) {
  if (isOnePointZero(n))
    n = "100%";
  var processPercent = isPercentage(n);
  n = Math.min(max, Math.max(0, parseFloat(n)));
  if (processPercent) {
    n = parseInt(n * max, 10) / 100;
  }
  if (Math.abs(n - max) < 1e-6) {
    return 1;
  }
  return n % max / parseFloat(max);
}
function clamp01(val) {
  return Math.min(1, Math.max(0, val));
}
function parseIntFromHex(val) {
  return parseInt(val, 16);
}
function isOnePointZero(n) {
  return typeof n == "string" && n.indexOf(".") != -1 && parseFloat(n) === 1;
}
function isPercentage(n) {
  return typeof n === "string" && n.indexOf("%") != -1;
}
function pad2(c) {
  return c.length == 1 ? "0" + c : "" + c;
}
function convertToPercentage(n) {
  if (n <= 1) {
    n = n * 100 + "%";
  }
  return n;
}
function convertDecimalToHex(d) {
  return Math.round(parseFloat(d) * 255).toString(16);
}
function convertHexToDecimal(h) {
  return parseIntFromHex(h) / 255;
}
var matchers = function() {
  var CSS_INTEGER = "[-\\+]?\\d+%?";
  var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";
  var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";
  var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
  var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
  return {
    CSS_UNIT: new RegExp(CSS_UNIT),
    rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
    rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
    hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
    hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
    hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
    hsva: new RegExp("hsva" + PERMISSIVE_MATCH4),
    hex3: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
    hex6: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/,
    hex4: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
    hex8: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
  };
}();
function isValidCSSUnit(color) {
  return !!matchers.CSS_UNIT.exec(color);
}
function stringInputToObject(color) {
  color = color.replace(trimLeft, "").replace(trimRight, "").toLowerCase();
  var named = false;
  if (names[color]) {
    color = names[color];
    named = true;
  } else if (color == "transparent") {
    return {
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      format: "name"
    };
  }
  var match;
  if (match = matchers.rgb.exec(color)) {
    return {
      r: match[1],
      g: match[2],
      b: match[3]
    };
  }
  if (match = matchers.rgba.exec(color)) {
    return {
      r: match[1],
      g: match[2],
      b: match[3],
      a: match[4]
    };
  }
  if (match = matchers.hsl.exec(color)) {
    return {
      h: match[1],
      s: match[2],
      l: match[3]
    };
  }
  if (match = matchers.hsla.exec(color)) {
    return {
      h: match[1],
      s: match[2],
      l: match[3],
      a: match[4]
    };
  }
  if (match = matchers.hsv.exec(color)) {
    return {
      h: match[1],
      s: match[2],
      v: match[3]
    };
  }
  if (match = matchers.hsva.exec(color)) {
    return {
      h: match[1],
      s: match[2],
      v: match[3],
      a: match[4]
    };
  }
  if (match = matchers.hex8.exec(color)) {
    return {
      r: parseIntFromHex(match[1]),
      g: parseIntFromHex(match[2]),
      b: parseIntFromHex(match[3]),
      a: convertHexToDecimal(match[4]),
      format: named ? "name" : "hex8"
    };
  }
  if (match = matchers.hex6.exec(color)) {
    return {
      r: parseIntFromHex(match[1]),
      g: parseIntFromHex(match[2]),
      b: parseIntFromHex(match[3]),
      format: named ? "name" : "hex"
    };
  }
  if (match = matchers.hex4.exec(color)) {
    return {
      r: parseIntFromHex(match[1] + "" + match[1]),
      g: parseIntFromHex(match[2] + "" + match[2]),
      b: parseIntFromHex(match[3] + "" + match[3]),
      a: convertHexToDecimal(match[4] + "" + match[4]),
      format: named ? "name" : "hex8"
    };
  }
  if (match = matchers.hex3.exec(color)) {
    return {
      r: parseIntFromHex(match[1] + "" + match[1]),
      g: parseIntFromHex(match[2] + "" + match[2]),
      b: parseIntFromHex(match[3] + "" + match[3]),
      format: named ? "name" : "hex"
    };
  }
  return false;
}
function validateWCAG2Parms(parms) {
  var level, size;
  parms = parms || {
    level: "AA",
    size: "small"
  };
  level = (parms.level || "AA").toUpperCase();
  size = (parms.size || "small").toLowerCase();
  if (level !== "AA" && level !== "AAA") {
    level = "AA";
  }
  if (size !== "small" && size !== "large") {
    size = "small";
  }
  return {
    level,
    size
  };
}

// src/colors.ts
import { clamp } from "@excalidraw/math";
import { degreesToRadians } from "@excalidraw/math";
var DARK_MODE_COLORS_CACHE = typeof window !== "undefined" ? /* @__PURE__ */ new Map() : null;
function cssHueRotate(red, green, blue, degrees) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const a = degreesToRadians(degrees);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const matrix = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072
  ];
  const newR = r * matrix[0] + g * matrix[1] + b * matrix[2];
  const newG = r * matrix[3] + g * matrix[4] + b * matrix[5];
  const newB = r * matrix[6] + g * matrix[7] + b * matrix[8];
  return {
    r: Math.round(Math.max(0, Math.min(1, newR)) * 255),
    g: Math.round(Math.max(0, Math.min(1, newG)) * 255),
    b: Math.round(Math.max(0, Math.min(1, newB)) * 255)
  };
}
var cssInvert = (r, g, b, percent) => {
  const p = clamp(percent, 0, 100) / 100;
  const invertComponent = (color) => {
    const inverted = color * (1 - p) + (255 - color) * p;
    return Math.round(clamp(inverted, 0, 255));
  };
  const invertedR = invertComponent(r);
  const invertedG = invertComponent(g);
  const invertedB = invertComponent(b);
  return { r: invertedR, g: invertedG, b: invertedB };
};
var applyDarkModeFilter = (color) => {
  const cached = DARK_MODE_COLORS_CACHE?.get(color);
  if (cached) {
    return cached;
  }
  const tc = tinycolor(color);
  const alpha = tc.getAlpha();
  const rgb = tc.toRgb();
  const inverted = cssInvert(rgb.r, rgb.g, rgb.b, 93);
  const rotated = cssHueRotate(
    inverted.r,
    inverted.g,
    inverted.b,
    180
  );
  const result = rgbToHex2(rotated.r, rotated.g, rotated.b, alpha);
  if (DARK_MODE_COLORS_CACHE) {
    DARK_MODE_COLORS_CACHE.set(color, result);
  }
  return result;
};
var pick = (source, keys) => {
  return keys.reduce((acc, key) => {
    if (key in source) {
      acc[key] = source[key];
    }
    return acc;
  }, {});
};
var MAX_CUSTOM_COLORS_USED_IN_CANVAS = 5;
var COLORS_PER_ROW = 5;
var DEFAULT_CHART_COLOR_INDEX = 4;
var DEFAULT_ELEMENT_STROKE_COLOR_INDEX = 4;
var DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX = 1;
var COLOR_PALETTE = {
  transparent: "transparent",
  black: "#1e1e1e",
  white: "#ffffff",
  // open-color from https://github.com/yeun/open-color/blob/master/open-color.js
  // corresponds to indexes [0,2,4,6,8] (weights: 50, 200, 400, 600, 800)
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
  violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
  // radix bronze shades [3,5,7,9,11]
  bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"]
};
var COMMON_ELEMENT_SHADES = pick(COLOR_PALETTE, [
  "cyan",
  "blue",
  "violet",
  "grape",
  "pink",
  "green",
  "teal",
  "yellow",
  "orange",
  "red"
]);
var DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_STROKE_COLOR_INDEX]
];
var DEFAULT_ELEMENT_BACKGROUND_PICKS = [
  COLOR_PALETTE.transparent,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX]
];
var DEFAULT_CANVAS_BACKGROUND_PICKS = [
  COLOR_PALETTE.white,
  // radix slate2
  "#f8f9fa",
  // radix blue2
  "#f5faff",
  // radix yellow2
  "#fffce8",
  // radix bronze2
  "#fdf8f6"
];
var DEFAULT_ELEMENT_STROKE_COLOR_PALETTE = {
  // 1st row
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,
  // rest
  ...COMMON_ELEMENT_SHADES
};
var DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE = {
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,
  ...COMMON_ELEMENT_SHADES
};
var getAllColorsSpecificShade = (index) => [
  // 2nd row
  COLOR_PALETTE.cyan[index],
  COLOR_PALETTE.blue[index],
  COLOR_PALETTE.violet[index],
  COLOR_PALETTE.grape[index],
  COLOR_PALETTE.pink[index],
  // 3rd row
  COLOR_PALETTE.green[index],
  COLOR_PALETTE.teal[index],
  COLOR_PALETTE.yellow[index],
  COLOR_PALETTE.orange[index],
  COLOR_PALETTE.red[index]
];
var rgbToHex2 = (r, g, b, a) => {
  const hex6 = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  if (a !== void 0 && a < 1) {
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, "0");
    return `${hex6}${alphaHex}`;
  }
  return hex6;
};
var colorToHex = (color) => {
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return null;
  }
  const { r, g, b, a } = tc.toRgb();
  return rgbToHex2(r, g, b, a);
};
var isTransparent = (color) => {
  return tinycolor(color).getAlpha() === 0;
};
var COLOR_OUTLINE_CONTRAST_THRESHOLD = 240;
var calculateContrast = (r, g, b) => {
  const yiq = (r * 299 + g * 587 + b * 114) / 1e3;
  return yiq;
};
var isColorDark = (color, threshold = 160) => {
  if (!color) {
    return true;
  }
  if (isTransparent(color)) {
    return false;
  }
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return true;
  }
  const { r, g, b } = tc.toRgb();
  return calculateContrast(r, g, b) < threshold;
};
var normalizeInputColor = (color) => {
  color = color.trim();
  if (isTransparent(color)) {
    return color;
  }
  const tc = tinycolor(color);
  if (tc.isValid()) {
    if (["hex", "hex8"].includes(tc.getFormat()) && !color.startsWith("#")) {
      return `#${color}`;
    }
    return color;
  }
  return null;
};

// src/constants.ts
init_define_import_meta_env();
var supportsResizeObserver = typeof window !== "undefined" && "ResizeObserver" in window;
var APP_NAME = "Excalidraw";
var TEXT_AUTOWRAP_THRESHOLD = 36;
var DRAGGING_THRESHOLD = 10;
var MINIMUM_ARROW_SIZE = 20;
var LINE_CONFIRM_THRESHOLD = 8;
var ELEMENT_SHIFT_TRANSLATE_AMOUNT = 5;
var ELEMENT_TRANSLATE_AMOUNT = 1;
var TEXT_TO_CENTER_SNAP_THRESHOLD = 30;
var SHIFT_LOCKING_ANGLE = Math.PI / 12;
var DEFAULT_LASER_COLOR = "red";
var CURSOR_TYPE = {
  TEXT: "text",
  CROSSHAIR: "crosshair",
  GRABBING: "grabbing",
  GRAB: "grab",
  POINTER: "pointer",
  MOVE: "move",
  AUTO: ""
};
var POINTER_BUTTON = {
  MAIN: 0,
  WHEEL: 1,
  SECONDARY: 2,
  TOUCH: -1,
  ERASER: 5
};
var POINTER_EVENTS = {
  enabled: "all",
  disabled: "none",
  // asserted as any so it can be freely assigned to React Element
  // "pointerEnvets" CSS prop
  inheritFromUI: "var(--ui-pointerEvents)"
};
var EVENT = /* @__PURE__ */ ((EVENT2) => {
  EVENT2["COPY"] = "copy";
  EVENT2["PASTE"] = "paste";
  EVENT2["CUT"] = "cut";
  EVENT2["KEYDOWN"] = "keydown";
  EVENT2["KEYUP"] = "keyup";
  EVENT2["MOUSE_MOVE"] = "mousemove";
  EVENT2["RESIZE"] = "resize";
  EVENT2["UNLOAD"] = "unload";
  EVENT2["FOCUS"] = "focus";
  EVENT2["BLUR"] = "blur";
  EVENT2["DRAG_OVER"] = "dragover";
  EVENT2["DROP"] = "drop";
  EVENT2["GESTURE_END"] = "gestureend";
  EVENT2["BEFORE_UNLOAD"] = "beforeunload";
  EVENT2["GESTURE_START"] = "gesturestart";
  EVENT2["GESTURE_CHANGE"] = "gesturechange";
  EVENT2["POINTER_MOVE"] = "pointermove";
  EVENT2["POINTER_DOWN"] = "pointerdown";
  EVENT2["POINTER_UP"] = "pointerup";
  EVENT2["STATE_CHANGE"] = "statechange";
  EVENT2["WHEEL"] = "wheel";
  EVENT2["TOUCH_START"] = "touchstart";
  EVENT2["TOUCH_END"] = "touchend";
  EVENT2["HASHCHANGE"] = "hashchange";
  EVENT2["VISIBILITY_CHANGE"] = "visibilitychange";
  EVENT2["SCROLL"] = "scroll";
  EVENT2["EXCALIDRAW_LINK"] = "excalidraw-link";
  EVENT2["MENU_ITEM_SELECT"] = "menu.itemSelect";
  EVENT2["MESSAGE"] = "message";
  EVENT2["FULLSCREENCHANGE"] = "fullscreenchange";
  return EVENT2;
})(EVENT || {});
var YOUTUBE_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5
};
var ENV = {
  TEST: "test",
  DEVELOPMENT: "development",
  PRODUCTION: "production"
};
var CLASSES = {
  SIDEBAR: "sidebar",
  SHAPE_ACTIONS_MENU: "App-menu__left",
  ZOOM_ACTIONS: "zoom-actions",
  SEARCH_MENU_INPUT_WRAPPER: "layer-ui__search-inputWrapper",
  CONVERT_ELEMENT_TYPE_POPUP: "ConvertElementTypePopup",
  SHAPE_ACTIONS_THEME_SCOPE: "shape-actions-theme-scope",
  FRAME_NAME: "frame-name",
  DROPDOWN_MENU_EVENT_WRAPPER: "dropdown-menu-event-wrapper"
};
var FONT_SIZES = {
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36
};
var CJK_HAND_DRAWN_FALLBACK_FONT = "Xiaolai";
var WINDOWS_EMOJI_FALLBACK_FONT = "Segoe UI Emoji";
var FONT_FAMILY = {
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  // leave 4 unused as it was historically used for Assistant (which we don't use anymore) or custom font (Obsidian)
  Excalifont: 5,
  Nunito: 6,
  "Lilita One": 7,
  "Comic Shanns": 8,
  "Liberation Sans": 9,
  Assistant: 10
};
var SANS_SERIF_GENERIC_FONT = "sans-serif";
var MONOSPACE_GENERIC_FONT = "monospace";
var FONT_FAMILY_GENERIC_FALLBACKS = {
  [SANS_SERIF_GENERIC_FONT]: 998,
  [MONOSPACE_GENERIC_FONT]: 999
};
var FONT_FAMILY_FALLBACKS = {
  [CJK_HAND_DRAWN_FALLBACK_FONT]: 100,
  ...FONT_FAMILY_GENERIC_FALLBACKS,
  [WINDOWS_EMOJI_FALLBACK_FONT]: 1e3
};
function getGenericFontFamilyFallback(fontFamily) {
  switch (fontFamily) {
    case FONT_FAMILY.Cascadia:
    case FONT_FAMILY["Comic Shanns"]:
      return MONOSPACE_GENERIC_FONT;
    default:
      return SANS_SERIF_GENERIC_FONT;
  }
}
var getFontFamilyFallbacks = (fontFamily) => {
  const genericFallbackFont = getGenericFontFamilyFallback(fontFamily);
  switch (fontFamily) {
    case FONT_FAMILY.Excalifont:
      return [
        CJK_HAND_DRAWN_FALLBACK_FONT,
        genericFallbackFont,
        WINDOWS_EMOJI_FALLBACK_FONT
      ];
    default:
      return [genericFallbackFont, WINDOWS_EMOJI_FALLBACK_FONT];
  }
};
var THEME = {
  LIGHT: "light",
  DARK: "dark"
};
var DARK_THEME_FILTER = "invert(93%) hue-rotate(180deg)";
var FRAME_STYLE = {
  strokeColor: "#bbb",
  strokeWidth: 2,
  strokeStyle: "solid",
  fillStyle: "solid",
  roughness: 0,
  roundness: null,
  backgroundColor: "transparent",
  radius: 8,
  nameOffsetY: 3,
  nameColorLightTheme: "#999999",
  nameColorDarkTheme: "#7a7a7a",
  nameFontSize: 14,
  nameLineHeight: 1.25
};
var MIN_FONT_SIZE = 1;
var DEFAULT_FONT_SIZE = 20;
var DEFAULT_FONT_FAMILY = FONT_FAMILY.Excalifont;
var DEFAULT_TEXT_ALIGN = "left";
var DEFAULT_VERTICAL_ALIGN = "top";
var DEFAULT_VERSION = "{version}";
var DEFAULT_TRANSFORM_HANDLE_SPACING = 2;
var SIDE_RESIZING_THRESHOLD = 2 * DEFAULT_TRANSFORM_HANDLE_SPACING;
var EPSILON = 1e-5;
var DEFAULT_COLLISION_THRESHOLD = 2 * SIDE_RESIZING_THRESHOLD - EPSILON;
var COLOR_WHITE = "#ffffff";
var COLOR_CHARCOAL_BLACK = "#1e1e1e";
var COLOR_VOICE_CALL = "#a2f1a6";
var CANVAS_ONLY_ACTIONS = ["selectAll"];
var DEFAULT_GRID_SIZE = 20;
var DEFAULT_GRID_STEP = 5;
var IMAGE_MIME_TYPES = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  jfif: "image/jfif"
};
var STRING_MIME_TYPES = {
  text: "text/plain",
  html: "text/html",
  json: "application/json",
  // excalidraw data
  excalidraw: "application/vnd.excalidraw+json",
  excalidrawClipboard: "application/vnd.excalidraw.clipboard+json",
  // LEGACY: fully-qualified library JSON data
  excalidrawlib: "application/vnd.excalidrawlib+json",
  // list of excalidraw library item ids
  excalidrawlibIds: "application/vnd.excalidrawlib.ids+json"
};
var MIME_TYPES = {
  ...STRING_MIME_TYPES,
  // image-encoded excalidraw data
  "excalidraw.svg": "image/svg+xml",
  "excalidraw.png": "image/png",
  // binary
  binary: "application/octet-stream",
  // image
  ...IMAGE_MIME_TYPES
};
var ALLOWED_PASTE_MIME_TYPES = [
  MIME_TYPES.text,
  MIME_TYPES.html,
  ...Object.values(IMAGE_MIME_TYPES)
];
var EXPORT_IMAGE_TYPES = {
  png: "png",
  svg: "svg",
  clipboard: "clipboard"
};
var EXPORT_DATA_TYPES = {
  excalidraw: "excalidraw",
  excalidrawClipboard: "excalidraw/clipboard",
  excalidrawLibrary: "excalidrawlib",
  excalidrawClipboardWithAPI: "excalidraw-api/clipboard"
};
var getExportSource = () => window.EXCALIDRAW_EXPORT_SOURCE || window.location.origin;
var IMAGE_RENDER_TIMEOUT = 500;
var TAP_TWICE_TIMEOUT = 300;
var TOUCH_CTX_MENU_TIMEOUT = 500;
var TITLE_TIMEOUT = 1e4;
var VERSION_TIMEOUT = 3e4;
var SCROLL_TIMEOUT = 100;
var ZOOM_STEP = 0.1;
var MIN_ZOOM = 0.1;
var MAX_ZOOM = 30;
var HYPERLINK_TOOLTIP_DELAY = 300;
var IDLE_THRESHOLD = 6e4;
var ACTIVE_THRESHOLD = 3e3;
var URL_QUERY_KEYS = {
  addLibrary: "addLibrary"
};
var URL_HASH_KEYS = {
  addLibrary: "addLibrary"
};
var DEFAULT_UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: true,
    clearCanvas: true,
    export: { saveFileToDisk: true },
    loadScene: true,
    saveToActiveFile: true,
    toggleTheme: null,
    saveAsImage: true
  },
  tools: {
    image: true
  }
};
var MAX_DECIMALS_FOR_SVG_EXPORT = 2;
var EXPORT_SCALES = [1, 2, 3];
var DEFAULT_EXPORT_PADDING = 10;
var DEFAULT_MAX_IMAGE_WIDTH_OR_HEIGHT = 1440;
var MAX_ALLOWED_FILE_BYTES = 4 * 1024 * 1024;
var SVG_NS = "http://www.w3.org/2000/svg";
var SVG_DOCUMENT_PREAMBLE = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
`;
var ENCRYPTION_KEY_BITS = 128;
var VERSIONS = {
  excalidraw: 2,
  excalidrawLibrary: 2
};
var BOUND_TEXT_PADDING = 5;
var ARROW_LABEL_WIDTH_FRACTION = 0.7;
var ARROW_LABEL_FONT_SIZE_TO_MIN_WIDTH_RATIO = 11;
var VERTICAL_ALIGN = {
  TOP: "top",
  MIDDLE: "middle",
  BOTTOM: "bottom"
};
var TEXT_ALIGN = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right"
};
var ELEMENT_READY_TO_ERASE_OPACITY = 20;
var DEFAULT_PROPORTIONAL_RADIUS = 0.25;
var DEFAULT_ADAPTIVE_RADIUS = 32;
var ROUNDNESS = {
  // Used for legacy rounding (rectangles), which currently works the same
  // as PROPORTIONAL_RADIUS, but we need to differentiate for UI purposes and
  // forwards-compat.
  LEGACY: 1,
  // Used for linear elements & diamonds
  PROPORTIONAL_RADIUS: 2,
  // Current default algorithm for rectangles, using fixed pixel radius.
  // It's working similarly to a regular border-radius, but attemps to make
  // radius visually similar across differnt element sizes, especially
  // very large and very small elements.
  //
  // NOTE right now we don't allow configuration and use a constant radius
  // (see DEFAULT_ADAPTIVE_RADIUS constant)
  ADAPTIVE_RADIUS: 3
};
var ROUGHNESS = {
  architect: 0,
  artist: 1,
  cartoonist: 2
};
var STROKE_WIDTH = {
  thin: 1,
  bold: 2,
  extraBold: 4
};
var DEFAULT_ELEMENT_PROPS = {
  strokeColor: COLOR_PALETTE.black,
  backgroundColor: COLOR_PALETTE.transparent,
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: ROUGHNESS.artist,
  opacity: 100,
  locked: false
};
var LIBRARY_SIDEBAR_TAB = "library";
var CANVAS_SEARCH_TAB = "search";
var DEFAULT_SIDEBAR = {
  name: "default",
  defaultTab: LIBRARY_SIDEBAR_TAB
};
var LIBRARY_DISABLED_TYPES = /* @__PURE__ */ new Set([
  "iframe",
  "embeddable",
  "image"
]);
var TOOL_TYPE = {
  selection: "selection",
  lasso: "lasso",
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  text: "text",
  image: "image",
  eraser: "eraser",
  hand: "hand",
  frame: "frame",
  magicframe: "magicframe",
  embeddable: "embeddable",
  laser: "laser"
};
var EDITOR_LS_KEYS = {
  OAI_API_KEY: "excalidraw-oai-api-key",
  // legacy naming (non)scheme
  MERMAID_TO_EXCALIDRAW: "mermaid-to-excalidraw",
  PUBLISH_LIBRARY: "publish-library-data"
};
var DEFAULT_FILENAME = "Untitled";
var STATS_PANELS = { generalStats: 1, elementProperties: 2 };
var MIN_WIDTH_OR_HEIGHT = 1;
var ARROW_TYPE = {
  sharp: "sharp",
  round: "round",
  elbow: "elbow"
};
var DEFAULT_REDUCED_GLOBAL_ALPHA = 0.3;
var ELEMENT_LINK_KEY = "element";
var ORIG_ID = Symbol.for("__test__originalId__");
var UserIdleState = /* @__PURE__ */ ((UserIdleState2) => {
  UserIdleState2["ACTIVE"] = "active";
  UserIdleState2["AWAY"] = "away";
  UserIdleState2["IDLE"] = "idle";
  return UserIdleState2;
})(UserIdleState || {});
var LINE_POLYGON_POINT_MERGE_DISTANCE = 20;
var DOUBLE_TAP_POSITION_THRESHOLD = 35;
var BIND_MODE_TIMEOUT = 700;
var MOBILE_ACTION_BUTTON_BG = {
  background: "var(--mobile-action-button-bg)"
};

// src/font-metadata.ts
init_define_import_meta_env();
var FONT_METADATA = {
  [FONT_FAMILY.Excalifont]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 886,
      descender: -374,
      lineHeight: 1.25
    }
  },
  [FONT_FAMILY.Nunito]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 1011,
      descender: -353,
      lineHeight: 1.25
    }
  },
  [FONT_FAMILY["Lilita One"]]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 923,
      descender: -220,
      lineHeight: 1.15
    }
  },
  [FONT_FAMILY["Comic Shanns"]]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 750,
      descender: -250,
      lineHeight: 1.25
    }
  },
  [FONT_FAMILY.Virgil]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 886,
      descender: -374,
      lineHeight: 1.25
    },
    deprecated: true
  },
  [FONT_FAMILY.Helvetica]: {
    metrics: {
      unitsPerEm: 2048,
      ascender: 1577,
      descender: -471,
      lineHeight: 1.15
    },
    deprecated: true,
    local: true
  },
  [FONT_FAMILY.Cascadia]: {
    metrics: {
      unitsPerEm: 2048,
      ascender: 1900,
      descender: -480,
      lineHeight: 1.2
    },
    deprecated: true
  },
  [FONT_FAMILY["Liberation Sans"]]: {
    metrics: {
      unitsPerEm: 2048,
      ascender: 1854,
      descender: -434,
      lineHeight: 1.15
    },
    private: true
  },
  [FONT_FAMILY.Assistant]: {
    metrics: {
      unitsPerEm: 2048,
      ascender: 1021,
      descender: -287,
      lineHeight: 1.25
    },
    private: true
  },
  [FONT_FAMILY_FALLBACKS.Xiaolai]: {
    metrics: {
      unitsPerEm: 1e3,
      ascender: 880,
      descender: -144,
      lineHeight: 1.25
    },
    fallback: true
  },
  [FONT_FAMILY_FALLBACKS["Segoe UI Emoji"]]: {
    metrics: {
      // reusing Excalifont metrics
      unitsPerEm: 1e3,
      ascender: 886,
      descender: -374,
      lineHeight: 1.25
    },
    local: true,
    fallback: true
  }
};
var GOOGLE_FONTS_RANGES = {
  LATIN: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  LATIN_EXT: "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  CYRILIC_EXT: "U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  CYRILIC: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  VIETNAMESE: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB"
};
var LOCAL_FONT_PROTOCOL = "local:";
var getVerticalOffset = (fontFamily, fontSize, lineHeightPx) => {
  const { unitsPerEm, ascender, descender } = FONT_METADATA[fontFamily]?.metrics || FONT_METADATA[FONT_FAMILY.Excalifont].metrics;
  const fontSizeEm = fontSize / unitsPerEm;
  const lineGap = (lineHeightPx - fontSizeEm * ascender + fontSizeEm * descender) / 2;
  const verticalOffset = fontSizeEm * ascender + lineGap;
  return verticalOffset;
};
var getLineHeight = (fontFamily) => {
  const { lineHeight } = FONT_METADATA[fontFamily]?.metrics || FONT_METADATA[FONT_FAMILY.Excalifont].metrics;
  return lineHeight;
};

// src/queue.ts
init_define_import_meta_env();
var Queue = class {
  jobs = [];
  running = false;
  tick() {
    if (this.running) {
      return;
    }
    const job = this.jobs.shift();
    if (job) {
      this.running = true;
      job.promise.resolve(
        promiseTry(job.jobFactory, ...job.args).finally(() => {
          this.running = false;
          this.tick();
        })
      );
    } else {
      this.running = false;
    }
  }
  push(jobFactory, ...args) {
    const promise = resolvablePromise();
    this.jobs.push({ jobFactory, promise, args });
    this.tick();
    return promise;
  }
};

// src/keys.ts
init_define_import_meta_env();

// src/editorInterface.ts
init_define_import_meta_env();
var DESKTOP_UI_MODE_STORAGE_KEY = "excalidraw.desktopUIMode";
var MQ_MAX_MOBILE = 599;
var MQ_MAX_WIDTH_LANDSCAPE = 1e3;
var MQ_MAX_HEIGHT_LANDSCAPE = 500;
var MQ_MIN_TABLET = MQ_MAX_MOBILE + 1;
var MQ_MAX_TABLET = 1180;
var MQ_MIN_WIDTH_DESKTOP = 1440;
var MQ_RIGHT_SIDEBAR_MIN_WIDTH = 1229;
var isDarwin = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
var isWindows = /^Win/.test(navigator.platform);
var isAndroid = /\b(android)\b/i.test(navigator.userAgent);
var isFirefox = typeof window !== "undefined" && "netscape" in window && navigator.userAgent.indexOf("rv:") > 1 && navigator.userAgent.indexOf("Gecko") > 1;
var isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
var isSafari = !isChrome && navigator.userAgent.indexOf("Safari") !== -1;
var isIOS = /iPad|iPhone/i.test(navigator.platform) || // iPadOS 13+
navigator.userAgent.includes("Mac") && "ontouchend" in document;
var isBrave = () => navigator.brave?.isBrave?.name === "isBrave";
var isMobileBreakpoint = (width, height) => {
  return width <= MQ_MAX_MOBILE || height < MQ_MAX_HEIGHT_LANDSCAPE && width < MQ_MAX_WIDTH_LANDSCAPE;
};
var isTabletBreakpoint = (editorWidth, editorHeight) => {
  const minSide = Math.min(editorWidth, editorHeight);
  const maxSide = Math.max(editorWidth, editorHeight);
  return minSide >= MQ_MIN_TABLET && maxSide <= MQ_MAX_TABLET;
};
var isMobileOrTablet = () => {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const uaData = navigator.userAgentData;
  if (uaData) {
    const plat = (uaData.platform || "").toLowerCase();
    const isDesktopOS = plat === "windows" || plat === "macos" || plat === "linux" || plat === "chrome os";
    if (uaData.mobile === true) {
      return true;
    }
    if (uaData.mobile === false && plat === "android") {
      const looksTouchTablet = matchMedia?.("(hover: none)").matches && matchMedia?.("(pointer: coarse)").matches;
      return looksTouchTablet;
    }
    if (isDesktopOS) {
      return false;
    }
  }
  if (isIOS) {
    return true;
  }
  if (isAndroid) {
    const isAndroidPhone = /Mobile/i.test(ua);
    const isAndroidTablet = !isAndroidPhone;
    if (isAndroidPhone || isAndroidTablet) {
      const looksTouchTablet = matchMedia?.("(hover: none)").matches && matchMedia?.("(pointer: coarse)").matches;
      return looksTouchTablet;
    }
  }
  const looksDesktopPlatform = /Win|Linux|CrOS|Mac/.test(platform) || /Windows NT|X11|CrOS|Macintosh/.test(ua);
  if (looksDesktopPlatform) {
    return false;
  }
  return false;
};
var getFormFactor = (editorWidth, editorHeight) => {
  if (isMobileBreakpoint(editorWidth, editorHeight)) {
    return "phone";
  }
  if (isTabletBreakpoint(editorWidth, editorHeight)) {
    return "tablet";
  }
  return "desktop";
};
var deriveStylesPanelMode = (editorInterface) => {
  if (editorInterface.formFactor === "phone") {
    return "mobile";
  }
  if (editorInterface.formFactor === "tablet") {
    return editorInterface.desktopUIMode === "full" ? "full" : "compact";
  }
  return editorInterface.desktopUIMode;
};
var createUserAgentDescriptor = (userAgentString) => {
  const normalizedUA = userAgentString ?? "";
  let platform = "unknown";
  if (isIOS) {
    platform = "ios";
  } else if (isAndroid) {
    platform = "android";
  } else if (normalizedUA) {
    platform = "other";
  }
  return {
    isMobileDevice: isMobileOrTablet(),
    platform
  };
};
var loadDesktopUIModePreference = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(DESKTOP_UI_MODE_STORAGE_KEY);
    if (stored === "compact" || stored === "full") {
      return stored;
    }
  } catch (error) {
  }
  return null;
};
var persistDesktopUIMode = (mode) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DESKTOP_UI_MODE_STORAGE_KEY, mode);
  } catch (error) {
  }
};
var setDesktopUIMode = (mode) => {
  if (mode !== "compact" && mode !== "full") {
    return;
  }
  persistDesktopUIMode(mode);
  return mode;
};

// src/keys.ts
var CODES = {
  EQUAL: "Equal",
  MINUS: "Minus",
  NUM_ADD: "NumpadAdd",
  NUM_SUBTRACT: "NumpadSubtract",
  NUM_ZERO: "Numpad0",
  BRACKET_RIGHT: "BracketRight",
  BRACKET_LEFT: "BracketLeft",
  ONE: "Digit1",
  TWO: "Digit2",
  THREE: "Digit3",
  NINE: "Digit9",
  QUOTE: "Quote",
  ZERO: "Digit0",
  SLASH: "Slash",
  C: "KeyC",
  D: "KeyD",
  H: "KeyH",
  V: "KeyV",
  Z: "KeyZ",
  Y: "KeyY",
  R: "KeyR",
  S: "KeyS"
};
var KEYS = {
  ARROW_DOWN: "ArrowDown",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  ARROW_UP: "ArrowUp",
  PAGE_UP: "PageUp",
  PAGE_DOWN: "PageDown",
  BACKSPACE: "Backspace",
  ALT: "Alt",
  CTRL_OR_CMD: isDarwin ? "metaKey" : "ctrlKey",
  DELETE: "Delete",
  ENTER: "Enter",
  ESCAPE: "Escape",
  QUESTION_MARK: "?",
  SPACE: " ",
  TAB: "Tab",
  CHEVRON_LEFT: "<",
  CHEVRON_RIGHT: ">",
  PERIOD: ".",
  COMMA: ",",
  SUBTRACT: "-",
  SLASH: "/",
  A: "a",
  C: "c",
  D: "d",
  E: "e",
  F: "f",
  G: "g",
  H: "h",
  I: "i",
  L: "l",
  O: "o",
  P: "p",
  Q: "q",
  R: "r",
  S: "s",
  T: "t",
  V: "v",
  X: "x",
  Y: "y",
  Z: "z",
  K: "k",
  W: "w",
  0: "0",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9"
};
var KeyCodeMap = /* @__PURE__ */ new Map([
  [KEYS.Z, CODES.Z],
  [KEYS.Y, CODES.Y]
]);
var isLatinChar = (key) => /^[a-z]$/.test(key.toLowerCase());
var matchKey = (event, key) => {
  if (key === event.key.toLowerCase()) {
    return true;
  }
  const code = KeyCodeMap.get(key);
  return Boolean(code && !isLatinChar(event.key) && event.code === code);
};
var isArrowKey = (key) => key === KEYS.ARROW_LEFT || key === KEYS.ARROW_RIGHT || key === KEYS.ARROW_DOWN || key === KEYS.ARROW_UP;
var shouldResizeFromCenter = (event) => event.altKey;
var shouldMaintainAspectRatio = (event) => event.shiftKey;
var shouldRotateWithDiscreteAngle = (event) => event.shiftKey;

// src/points.ts
init_define_import_meta_env();
import {
  pointFromPair
} from "@excalidraw/math";
var getSizeFromPoints = (points) => {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
};
var rescalePoints = (dimension, newSize, points, normalize) => {
  const coordinates = points.map((point) => point[dimension]);
  const maxCoordinate = Math.max(...coordinates);
  const minCoordinate = Math.min(...coordinates);
  const size = maxCoordinate - minCoordinate;
  const scale = size === 0 ? 1 : newSize / size;
  let nextMinCoordinate = Infinity;
  const scaledPoints = points.map((point) => {
    const newCoordinate = point[dimension] * scale;
    const newPoint = [...point];
    newPoint[dimension] = newCoordinate;
    if (newCoordinate < nextMinCoordinate) {
      nextMinCoordinate = newCoordinate;
    }
    return newPoint;
  });
  if (!normalize) {
    return scaledPoints;
  }
  if (scaledPoints.length === 2) {
    return scaledPoints;
  }
  const translation = minCoordinate - nextMinCoordinate;
  const nextPoints = scaledPoints.map(
    (scaledPoint) => pointFromPair(
      scaledPoint.map((value, currentDimension) => {
        return currentDimension === dimension ? value + translation : value;
      })
    )
  );
  return nextPoints;
};
var getGridPoint = (x, y, gridSize) => {
  if (gridSize) {
    return [
      Math.round(x / gridSize) * gridSize,
      Math.round(y / gridSize) * gridSize
    ];
  }
  return [x, y];
};

// src/promise-pool.ts
init_define_import_meta_env();
var import_es6_promise_pool = __toESM(require_es6_promise_pool(), 1);
var PromisePool = class {
  pool;
  entries = {};
  constructor(source, concurrency) {
    this.pool = new import_es6_promise_pool.default(
      source,
      concurrency
    );
  }
  all() {
    const listener = (event) => {
      if (event.data.result) {
        const [index, value] = event.data.result;
        this.entries[index] = value;
      }
    };
    this.pool.addEventListener("fulfilled", listener);
    return this.pool.start().then(() => {
      setTimeout(() => {
        this.pool.removeEventListener("fulfilled", listener);
      });
      return Object.values(this.entries);
    });
  }
};

// src/random.ts
init_define_import_meta_env();

// ../../node_modules/nanoid/index.browser.js
init_define_import_meta_env();

// ../../node_modules/nanoid/url-alphabet/index.js
init_define_import_meta_env();

// ../../node_modules/nanoid/index.browser.js
var nanoid = (size = 21) => crypto.getRandomValues(new Uint8Array(size)).reduce((id, byte) => {
  byte &= 63;
  if (byte < 36) {
    id += byte.toString(36);
  } else if (byte < 62) {
    id += (byte - 26).toString(36).toUpperCase();
  } else if (byte > 62) {
    id += "-";
  } else {
    id += "_";
  }
  return id;
}, "");

// ../../node_modules/roughjs/bin/math.js
init_define_import_meta_env();
var Random = class {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    if (this.seed) {
      return (2 ** 31 - 1 & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31;
    } else {
      return Math.random();
    }
  }
};

// src/utils.ts
init_define_import_meta_env();
import { average } from "@excalidraw/math";
var mockDateTime = null;
var setDateTimeForTests = (dateTime) => {
  mockDateTime = dateTime;
};
var getDateTime = () => {
  if (mockDateTime) {
    return mockDateTime;
  }
  const date = /* @__PURE__ */ new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hr = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}-${hr}${min}`;
};
var capitalizeString = (str) => str.charAt(0).toUpperCase() + str.slice(1);
var isToolIcon = (target) => target instanceof HTMLElement && target.className.includes("ToolIcon");
var isInputLike = (target) => target instanceof HTMLElement && target.dataset.type === "wysiwyg" || target instanceof HTMLBRElement || // newline in wysiwyg
target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
var isInteractive = (target) => {
  return isInputLike(target) || target instanceof Element && !!target.closest("label, button");
};
var isWritableElement = (target) => target instanceof HTMLElement && target.dataset.type === "wysiwyg" || target instanceof HTMLBRElement || // newline in wysiwyg
target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement && (target.type === "text" || target.type === "number" || target.type === "password" || target.type === "search") || target instanceof HTMLElement && target.closest(".cm-editor") !== null;
var getFontFamilyString = ({
  fontFamily
}) => {
  for (const [fontFamilyString, id] of Object.entries(FONT_FAMILY)) {
    if (id === fontFamily) {
      return `${fontFamilyString}${getFontFamilyFallbacks(id).map((x) => `, ${x}`).join("")}`;
    }
  }
  return WINDOWS_EMOJI_FALLBACK_FONT;
};
var getFontString = ({
  fontSize,
  fontFamily
}) => {
  return `${fontSize}px ${getFontFamilyString({ fontFamily })}`;
};
var nextAnimationFrame = async (cb) => {
  requestAnimationFrame(() => requestAnimationFrame(cb));
};
var debounce = (fn, timeout) => {
  let handle = 0;
  let lastArgs = null;
  const ret = (...args) => {
    lastArgs = args;
    clearTimeout(handle);
    handle = window.setTimeout(() => {
      lastArgs = null;
      fn(...args);
    }, timeout);
  };
  ret.flush = () => {
    clearTimeout(handle);
    if (lastArgs) {
      const _lastArgs = lastArgs;
      lastArgs = null;
      fn(..._lastArgs);
    }
  };
  ret.cancel = () => {
    lastArgs = null;
    clearTimeout(handle);
  };
  return ret;
};
var throttleRAF = (fn) => {
  let timerId = null;
  let lastArgs = null;
  const scheduleFunc = () => {
    timerId = window.requestAnimationFrame(() => {
      timerId = null;
      const args = lastArgs;
      lastArgs = null;
      if (args) {
        fn(...args);
      }
    });
  };
  const ret = (...args) => {
    lastArgs = args;
    if (timerId === null) {
      scheduleFunc();
    }
  };
  ret.flush = () => {
    if (timerId !== null) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };
  ret.cancel = () => {
    lastArgs = null;
    if (timerId !== null) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
  };
  return ret;
};
var easeOut = (k) => {
  return 1 - Math.pow(1 - k, 4);
};
var easeOutInterpolate = (from, to, progress) => {
  return (to - from) * easeOut(progress) + from;
};
var easeToValuesRAF = ({
  fromValues,
  toValues,
  onStep,
  duration = 250,
  interpolateValue,
  onStart,
  onEnd,
  onCancel
}) => {
  let canceled = false;
  let frameId = 0;
  let startTime;
  function step(timestamp) {
    if (canceled) {
      return;
    }
    if (startTime === void 0) {
      startTime = timestamp;
      onStart?.();
    }
    const elapsed = Math.min(timestamp - startTime, duration);
    const factor = easeOut(elapsed / duration);
    const newValues = {};
    Object.keys(fromValues).forEach((key) => {
      const _key = key;
      const result = (toValues[_key] - fromValues[_key]) * factor + fromValues[_key];
      newValues[_key] = result;
    });
    onStep(newValues);
    if (elapsed < duration) {
      const progress = elapsed / duration;
      const newValues2 = {};
      Object.keys(fromValues).forEach((key) => {
        const _key = key;
        const startValue = fromValues[_key];
        const endValue = toValues[_key];
        let result;
        result = interpolateValue ? interpolateValue(startValue, endValue, progress, _key) : easeOutInterpolate(startValue, endValue, progress);
        if (result == null) {
          result = easeOutInterpolate(startValue, endValue, progress);
        }
        newValues2[_key] = result;
      });
      onStep(newValues2);
      frameId = window.requestAnimationFrame(step);
    } else {
      onStep(toValues);
      onEnd?.();
    }
  }
  frameId = window.requestAnimationFrame(step);
  return () => {
    onCancel?.();
    canceled = true;
    window.cancelAnimationFrame(frameId);
  };
};
var chunk = (array, size) => {
  if (!array.length || size < 1) {
    return [];
  }
  let index = 0;
  let resIndex = 0;
  const result = Array(Math.ceil(array.length / size));
  while (index < array.length) {
    result[resIndex++] = array.slice(index, index += size);
  }
  return result;
};
var selectNode = (node) => {
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }
};
var removeSelection = () => {
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
};
var distance = (x, y) => Math.abs(x - y);
var isSelectionLikeTool = (type) => {
  return type === "selection" || type === "lasso";
};
var updateActiveTool = (appState, data) => {
  if (data.type === "custom") {
    return {
      ...appState.activeTool,
      type: "custom",
      customType: data.customType,
      locked: data.locked ?? appState.activeTool.locked
    };
  }
  return {
    ...appState.activeTool,
    lastActiveTool: data.lastActiveToolBeforeEraser === void 0 ? appState.activeTool.lastActiveTool : data.lastActiveToolBeforeEraser,
    type: data.type,
    customType: null,
    locked: data.locked ?? appState.activeTool.locked,
    fromSelection: data.fromSelection ?? false
  };
};
var isFullScreen = () => document.fullscreenElement?.nodeName === "HTML";
var allowFullScreen = () => document.documentElement.requestFullscreen();
var exitFullScreen = () => document.exitFullscreen();
var viewportCoordsToSceneCoords = ({ clientX, clientY }, {
  zoom,
  offsetLeft,
  offsetTop,
  scrollX,
  scrollY
}) => {
  const x = (clientX - offsetLeft) / zoom.value - scrollX;
  const y = (clientY - offsetTop) / zoom.value - scrollY;
  return { x, y };
};
var sceneCoordsToViewportCoords = ({ sceneX, sceneY }, {
  zoom,
  offsetLeft,
  offsetTop,
  scrollX,
  scrollY
}) => {
  const x = (sceneX + scrollX) * zoom.value + offsetLeft;
  const y = (sceneY + scrollY) * zoom.value + offsetTop;
  return { x, y };
};
var getGlobalCSSVariable = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);
var RS_LTR_CHARS = "A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\u02B8\u0300-\u0590\u0800-\u1FFF\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF";
var RS_RTL_CHARS = "\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC";
var RE_RTL_CHECK = new RegExp(`^[^${RS_LTR_CHARS}]*[${RS_RTL_CHARS}]`);
var isRTL = (text) => RE_RTL_CHECK.test(text);
var tupleToCoors = (xyTuple) => {
  const [x, y] = xyTuple;
  return { x, y };
};
var muteFSAbortError = (error) => {
  if (error?.name === "AbortError") {
    console.warn(error);
    return;
  }
  throw error;
};
var findIndex = (array, cb, fromIndex = 0) => {
  if (fromIndex < 0) {
    fromIndex = array.length + fromIndex;
  }
  fromIndex = Math.min(array.length, Math.max(fromIndex, 0));
  let index = fromIndex - 1;
  while (++index < array.length) {
    if (cb(array[index], index, array)) {
      return index;
    }
  }
  return -1;
};
var findLastIndex = (array, cb, fromIndex = array.length - 1) => {
  if (fromIndex < 0) {
    fromIndex = array.length + fromIndex;
  }
  fromIndex = Math.min(array.length - 1, Math.max(fromIndex, 0));
  let index = fromIndex + 1;
  while (--index > -1) {
    if (cb(array[index], index, array)) {
      return index;
    }
  }
  return -1;
};
var mapFind = (collection, iteratee) => {
  for (let idx = 0; idx < collection.length; idx++) {
    const result = iteratee(collection[idx], idx);
    if (result != null) {
      return result;
    }
  }
  return void 0;
};
var resolvablePromise = () => {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
};
var nFormatter = (num, digits) => {
  const si = [
    { value: 1, symbol: "b" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" }
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  let index;
  for (index = si.length - 1; index > 0; index--) {
    if (num >= si[index].value) {
      break;
    }
  }
  return (num / si[index].value).toFixed(digits).replace(rx, "$1") + si[index].symbol;
};
var getVersion = () => {
  return document.querySelector('meta[name="version"]')?.content || DEFAULT_VERSION;
};
var supportsEmoji = () => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const offset = 12;
  ctx.fillStyle = "#f00";
  ctx.textBaseline = "top";
  ctx.font = "32px Arial";
  ctx.fillText("\u{1F600}", 0, 0);
  return ctx.getImageData(offset, offset, 1, 1).data[0] !== 0;
};
var getNearestScrollableContainer = (element) => {
  let parent = element.parentElement;
  while (parent) {
    if (parent === document.body) {
      return document;
    }
    const { overflowY } = window.getComputedStyle(parent);
    const hasScrollableContent = parent.scrollHeight > parent.clientHeight;
    if (hasScrollableContent && (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document;
};
var focusNearestParent = (element) => {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tabIndex > -1) {
      parent.focus();
      return;
    }
    parent = parent.parentElement;
  }
};
var preventUnload = (event) => {
  event.preventDefault();
  event.returnValue = "";
};
var bytesToHexString = (bytes) => {
  return Array.from(bytes).map((byte) => `0${byte.toString(16)}`.slice(-2)).join("");
};
var getUpdatedTimestamp = () => isTestEnv() ? 1 : Date.now();
var arrayToMap = (items) => {
  if (items instanceof Map) {
    return items;
  }
  return items.reduce((acc, element) => {
    acc.set(typeof element === "string" ? element : element.id, element);
    return acc;
  }, /* @__PURE__ */ new Map());
};
var arrayToMapWithIndex = (elements) => elements.reduce((acc, element, idx) => {
  acc.set(element.id, [element, idx]);
  return acc;
}, /* @__PURE__ */ new Map());
var arrayToObject = (array, groupBy) => array.reduce((acc, value, idx) => {
  acc[groupBy ? groupBy(value) : idx] = value;
  return acc;
}, {});
var arrayToList = (array) => array.reduce((acc, curr, index) => {
  const node = { ...curr, prev: null, next: null };
  if (index !== 0) {
    const prevNode = acc[index - 1];
    node.prev = prevNode;
    prevNode.next = node;
    if (index === array.length - 1) {
      const firstNode = acc[0];
      node.next = firstNode;
      firstNode.prev = node;
    }
  }
  acc.push(node);
  return acc;
}, []);
var toIterable = (values) => {
  return Array.isArray(values) ? values : values.values();
};
var toArray = (values) => {
  return Array.isArray(values) ? values : Array.from(toIterable(values));
};
var isTestEnv = () => define_import_meta_env_default.MODE === ENV.TEST;
var isDevEnv = () => define_import_meta_env_default.MODE === ENV.DEVELOPMENT;
var isProdEnv = () => define_import_meta_env_default.MODE === ENV.PRODUCTION;
var isServerEnv = () => typeof process !== "undefined" && true;
var wrapEvent = (name, nativeEvent) => {
  return new CustomEvent(name, {
    detail: {
      nativeEvent
    },
    cancelable: true
  });
};
var updateObject = (obj, updates) => {
  let didChange = false;
  for (const key in updates) {
    const value = updates[key];
    if (typeof value !== "undefined") {
      if (obj[key] === value && // if object, always update because its attrs could have changed
      (typeof value !== "object" || value === null)) {
        continue;
      }
      didChange = true;
    }
  }
  if (!didChange) {
    return obj;
  }
  return {
    ...obj,
    ...updates
  };
};
var isPrimitive = (val) => {
  const type = typeof val;
  return val == null || type !== "object" && type !== "function";
};
var getFrame = () => {
  try {
    return window.self === window.top ? "top" : "iframe";
  } catch (error) {
    return "iframe";
  }
};
var isRunningInIframe = () => getFrame() === "iframe";
var isPromiseLike = (value) => {
  return !!value && typeof value === "object" && "then" in value && "catch" in value && "finally" in value;
};
var queryFocusableElements = (container) => {
  const focusableElements = container?.querySelectorAll(
    "button, a, input, select, textarea, div[tabindex], label[tabindex]"
  );
  return focusableElements ? Array.from(focusableElements).filter(
    (element) => element.tabIndex > -1 && !element.disabled
  ) : [];
};
var _defaultIsShallowComparatorFallback = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b) && a.length === 0 && b.length === 0) {
    return true;
  }
  return a === b;
};
var isShallowEqual = (objA, objB, comparators, debug = false) => {
  const aKeys = Object.keys(objA);
  const bKeys = Object.keys(objB);
  if (aKeys.length !== bKeys.length) {
    if (debug) {
      console.warn(
        `%cisShallowEqual: objects don't have same properties ->`,
        "color: #8B4000",
        objA,
        objB
      );
    }
    return false;
  }
  if (comparators && Array.isArray(comparators)) {
    for (const key of comparators) {
      const ret = objA[key] === objB[key] || _defaultIsShallowComparatorFallback(objA[key], objB[key]);
      if (!ret) {
        if (debug) {
          console.warn(
            `%cisShallowEqual: ${key} not equal ->`,
            "color: #8B4000",
            objA[key],
            objB[key]
          );
        }
        return false;
      }
    }
    return true;
  }
  return aKeys.every((key) => {
    const comparator = comparators?.[key];
    const ret = comparator ? comparator(objA[key], objB[key]) : objA[key] === objB[key] || _defaultIsShallowComparatorFallback(objA[key], objB[key]);
    if (!ret && debug) {
      console.warn(
        `%cisShallowEqual: ${key} not equal ->`,
        "color: #8B4000",
        objA[key],
        objB[key]
      );
    }
    return ret;
  });
};
var composeEventHandlers = (originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) => {
  return function handleEvent(event) {
    originalEventHandler?.(event);
    if (!checkForDefaultPrevented || !event?.defaultPrevented) {
      return ourEventHandler?.(event);
    }
  };
};
var assertNever = (value, message, softAssert) => {
  if (!message) {
    return value;
  }
  if (softAssert) {
    console.error(message);
    return value;
  }
  throw new Error(message);
};
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
var memoize = (func) => {
  let lastArgs;
  let lastResult;
  const ret = function(opts) {
    const currentArgs = Object.entries(opts);
    if (lastArgs) {
      let argsAreEqual = true;
      for (const [key, value] of currentArgs) {
        if (lastArgs.get(key) !== value) {
          argsAreEqual = false;
          break;
        }
      }
      if (argsAreEqual) {
        return lastResult;
      }
    }
    const result = func(opts);
    lastArgs = new Map(currentArgs);
    lastResult = result;
    return result;
  };
  ret.clear = () => {
    lastArgs = void 0;
    lastResult = void 0;
  };
  return ret;
};
var isMemberOf = (collection, value) => {
  return collection instanceof Set || collection instanceof Map ? collection.has(value) : "includes" in collection ? collection.includes(value) : collection.hasOwnProperty(value);
};
var cloneJSON = (obj) => JSON.parse(JSON.stringify(obj));
var updateStable = (prevValue, nextValue) => {
  if (isShallowEqual(prevValue, nextValue)) {
    return prevValue;
  }
  return nextValue;
};
function addEventListener(target, type, listener, options) {
  if (!target) {
    return () => {
    };
  }
  target?.addEventListener?.(type, listener, options);
  return () => {
    target?.removeEventListener?.(type, listener, options);
  };
}
function getSvgPathFromStroke(points, closed = true) {
  const len = points.length;
  if (len < 4) {
    return ``;
  }
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }
  if (closed) {
    result += "Z";
  }
  return result;
}
var normalizeEOL = (str) => {
  return str.replace(/\r?\n|\r/g, "\n");
};
function toBrandedType(value) {
  return value;
}
var promiseTry = async (fn, ...args) => {
  return new Promise((resolve) => {
    resolve(fn(...args));
  });
};
var isAnyTrue = (...args) => Math.max(...args.map((arg) => arg ? 1 : 0)) > 0;
var safelyParseJSON = (json) => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};
var escapeDoubleQuotes = (str) => {
  return str.replace(/"/g, "&quot;");
};
var castArray = (value) => Array.isArray(value) ? value : [value];
var isReadonlyArray = (value) => {
  return Array.isArray(value);
};
var sizeOf = (value) => {
  return isReadonlyArray(value) ? value.length : value instanceof Map || value instanceof Set ? value.size : Object.keys(value).length;
};
var reduceToCommonValue = (collection, getValue) => {
  if (sizeOf(collection) === 0) {
    return null;
  }
  const valueExtractor = getValue || ((item) => item);
  let commonValue = null;
  for (const item of collection) {
    const value = valueExtractor(item);
    if ((commonValue === null || commonValue === value) && value != null) {
      commonValue = value;
    } else {
      return null;
    }
  }
  return commonValue;
};
var FEATURE_FLAGS_STORAGE_KEY = "excalidraw-feature-flags";
var DEFAULT_FEATURE_FLAGS = {
  COMPLEX_BINDINGS: false
};
var featureFlags = null;
var getFeatureFlag = (flag) => {
  if (!featureFlags) {
    try {
      const serializedFlags = localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY);
      if (serializedFlags) {
        const flags = JSON.parse(serializedFlags);
        featureFlags = flags ?? DEFAULT_FEATURE_FLAGS;
      }
    } catch {
    }
  }
  return (featureFlags || DEFAULT_FEATURE_FLAGS)[flag];
};
var setFeatureFlag = (flag, value) => {
  try {
    featureFlags = {
      ...featureFlags || DEFAULT_FEATURE_FLAGS,
      [flag]: value
    };
    localStorage.setItem(
      FEATURE_FLAGS_STORAGE_KEY,
      JSON.stringify(featureFlags)
    );
  } catch (e) {
    console.error("unable to set feature flag", e);
  }
};
var oneOf = (needle, haystack) => {
  return haystack.includes(needle);
};

// src/random.ts
var random = new Random(Date.now());
var testIdBase = 0;
var randomInteger = () => Math.floor(random.next() * 2 ** 31);
var reseed = (seed) => {
  random = new Random(seed);
  testIdBase = 0;
};
var randomId = () => isTestEnv() ? `id${testIdBase++}` : nanoid();

// src/url.ts
init_define_import_meta_env();
var import_sanitize_url = __toESM(require_dist(), 1);
var normalizeLink = (link) => {
  link = link.trim();
  if (!link) {
    return link;
  }
  return (0, import_sanitize_url.sanitizeUrl)(escapeDoubleQuotes(link));
};
var isLocalLink = (link) => {
  return !!(link?.includes(location.origin) || link?.startsWith("/"));
};
var toValidURL = (link) => {
  link = normalizeLink(link);
  if (link.startsWith("/")) {
    return `${location.origin}${link}`;
  }
  try {
    new URL(link);
  } catch {
    return "about:blank";
  }
  return link;
};

// src/emitter.ts
init_define_import_meta_env();
var Emitter = class {
  subscribers = [];
  /**
   * Attaches subscriber
   *
   * @returns unsubscribe function
   */
  on(...handlers) {
    const _handlers = handlers.flat().filter((item) => typeof item === "function");
    this.subscribers.push(..._handlers);
    return () => this.off(_handlers);
  }
  once(...handlers) {
    const _handlers = handlers.flat().filter((item) => typeof item === "function");
    _handlers.push(() => detach());
    const detach = this.on(..._handlers);
    return detach;
  }
  off(...handlers) {
    const _handlers = handlers.flat();
    this.subscribers = this.subscribers.filter(
      (handler) => !_handlers.includes(handler)
    );
  }
  trigger(...payload) {
    for (const handler of this.subscribers) {
      handler(...payload);
    }
    return this;
  }
  clear() {
    this.subscribers = [];
  }
};

// src/appEventBus.ts
init_define_import_meta_env();
var AppEventBus = class {
  constructor(behavior) {
    this.behavior = behavior;
  }
  emitters = /* @__PURE__ */ new Map();
  lastPayload = /* @__PURE__ */ new Map();
  emittedOnce = /* @__PURE__ */ new Set();
  getEmitter(name) {
    let emitter = this.emitters.get(name);
    if (!emitter) {
      emitter = new Emitter();
      this.emitters.set(name, emitter);
    }
    return emitter;
  }
  toPromiseValue(args) {
    return args.length === 1 ? args[0] : args;
  }
  on(name, callback) {
    const eventBehavior = this.behavior[name];
    const cachedPayload = this.lastPayload.get(name);
    if (callback) {
      if (eventBehavior.replay === "last" && cachedPayload) {
        queueMicrotask(() => callback(...cachedPayload));
        if (eventBehavior.cardinality === "once") {
          return () => {
          };
        }
      }
      return this.getEmitter(name).on(callback);
    }
    if (eventBehavior.cardinality !== "once" || eventBehavior.replay !== "last") {
      throw new Error(`Event "${String(name)}" requires a callback`);
    }
    if (cachedPayload) {
      return Promise.resolve(this.toPromiseValue(cachedPayload));
    }
    return new Promise((resolve) => {
      this.getEmitter(name).once((...args) => {
        resolve(this.toPromiseValue(args));
      });
    });
  }
  emit(name, ...args) {
    const eventBehavior = this.behavior[name];
    if (!isProdEnv()) {
      if (eventBehavior.cardinality === "once") {
        if (this.emittedOnce.has(name)) {
          throw new Error(`Event "${String(name)}" can only be emitted once`);
        }
        this.emittedOnce.add(name);
      }
    }
    if (eventBehavior.replay === "last") {
      this.lastPayload.set(name, args);
    }
    try {
      this.getEmitter(name).trigger(...args);
    } finally {
      if (eventBehavior.cardinality === "once") {
        this.getEmitter(name).clear();
      }
    }
  }
  clear() {
    this.lastPayload.clear();
    this.emittedOnce.clear();
    for (const emitter of this.emitters.values()) {
      emitter.clear();
    }
    this.emitters.clear();
  }
};

// src/versionedSnapshotStore.ts
init_define_import_meta_env();
var VersionedSnapshotStore = class {
  constructor(initialValue, isEqual = Object.is) {
    this.isEqual = isEqual;
    this.value = initialValue;
  }
  version = 0;
  value;
  waiters = /* @__PURE__ */ new Set();
  subscribers = /* @__PURE__ */ new Set();
  getSnapshot() {
    return { version: this.version, value: this.value };
  }
  set(nextValue) {
    if (this.isEqual(this.value, nextValue)) {
      return false;
    }
    this.value = nextValue;
    this.version += 1;
    const snapshot = this.getSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
    for (const waiter of this.waiters) {
      waiter(snapshot);
    }
    this.waiters.clear();
    return true;
  }
  update(updater) {
    return this.set(updater(this.value));
  }
  subscribe(subscriber) {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
  pull(sinceVersion = -1) {
    if (this.version !== sinceVersion) {
      return Promise.resolve(this.getSnapshot());
    }
    return new Promise((resolve) => {
      this.waiters.add(resolve);
    });
  }
};

// debug.ts
init_define_import_meta_env();
var lessPrecise = (num, precision = 5) => parseFloat(num.toPrecision(precision));
var getAvgFrameTime = (times) => lessPrecise(times.reduce((a, b) => a + b) / times.length);
var Debug = class _Debug {
  static DEBUG_LOG_TIMES = true;
  static TIMES_AGGR = {};
  static TIMES_AVG = {};
  static LAST_DEBUG_LOG_CALL = 0;
  static DEBUG_LOG_INTERVAL_ID = null;
  static LAST_FRAME_TIMESTAMP = 0;
  static FRAME_COUNT = 0;
  static ANIMATION_FRAME_ID = null;
  static scheduleAnimationFrame = () => {
    if (_Debug.DEBUG_LOG_INTERVAL_ID !== null) {
      _Debug.ANIMATION_FRAME_ID = requestAnimationFrame((timestamp) => {
        if (_Debug.LAST_FRAME_TIMESTAMP !== timestamp) {
          _Debug.LAST_FRAME_TIMESTAMP = timestamp;
          _Debug.FRAME_COUNT++;
        }
        if (_Debug.DEBUG_LOG_INTERVAL_ID !== null) {
          _Debug.scheduleAnimationFrame();
        }
      });
    }
  };
  static setupInterval = () => {
    if (_Debug.DEBUG_LOG_INTERVAL_ID === null) {
      console.info("%c(starting perf recording)", "color: lime");
      _Debug.DEBUG_LOG_INTERVAL_ID = window.setInterval(_Debug.debugLogger, 1e3);
      _Debug.scheduleAnimationFrame();
    }
    _Debug.LAST_DEBUG_LOG_CALL = Date.now();
  };
  static debugLogger = () => {
    if (_Debug.DEBUG_LOG_TIMES) {
      for (const [name, { t, times }] of Object.entries(_Debug.TIMES_AGGR)) {
        if (times.length) {
          console.info(
            name,
            lessPrecise(times.reduce((a, b) => a + b)),
            times.sort((a, b) => a - b).map((x) => lessPrecise(x))
          );
          _Debug.TIMES_AGGR[name] = { t, times: [] };
        }
      }
      for (const [name, { t, times, avg }] of Object.entries(_Debug.TIMES_AVG)) {
        if (times.length) {
          const totalTime = times.reduce((a, b) => a + b);
          const avgFrameTime = lessPrecise(totalTime / _Debug.FRAME_COUNT);
          console.info(
            name,
            `- ${times.length} calls - ${avgFrameTime}ms/frame across ${_Debug.FRAME_COUNT} frames (${lessPrecise(
              avgFrameTime / 16.67 * 100,
              1
            )}% of frame budget)`
          );
          _Debug.TIMES_AVG[name] = {
            t,
            times: [],
            avg: avg != null ? getAvgFrameTime([avg, avgFrameTime]) : avgFrameTime
          };
        }
      }
    }
    _Debug.FRAME_COUNT = 0;
    if (Date.now() - _Debug.LAST_DEBUG_LOG_CALL > 600 && _Debug.DEBUG_LOG_INTERVAL_ID !== null) {
      console.info("%c(stopping perf recording)", "color: red");
      window.clearInterval(_Debug.DEBUG_LOG_INTERVAL_ID);
      window.cancelAnimationFrame(_Debug.ANIMATION_FRAME_ID);
      _Debug.ANIMATION_FRAME_ID = null;
      _Debug.FRAME_COUNT = 0;
      _Debug.LAST_FRAME_TIMESTAMP = 0;
      _Debug.DEBUG_LOG_INTERVAL_ID = null;
      _Debug.TIMES_AGGR = {};
      _Debug.TIMES_AVG = {};
    }
  };
  static logTime = (time, name = "default") => {
    _Debug.setupInterval();
    const now = performance.now();
    const { t, times } = _Debug.TIMES_AGGR[name] = _Debug.TIMES_AGGR[name] || {
      t: 0,
      times: []
    };
    if (t) {
      times.push(time != null ? time : now - t);
    }
    _Debug.TIMES_AGGR[name].t = now;
  };
  static logTimeAverage = (time, name = "default") => {
    _Debug.setupInterval();
    const now = performance.now();
    const { t, times } = _Debug.TIMES_AVG[name] = _Debug.TIMES_AVG[name] || {
      t: 0,
      times: []
    };
    if (t) {
      times.push(time != null ? time : now - t);
    }
    _Debug.TIMES_AVG[name].t = now;
  };
  static logWrapper = (type) => (fn, name = "default") => {
    return (...args) => {
      const t0 = performance.now();
      const ret = fn(...args);
      _Debug[type](performance.now() - t0, name);
      return ret;
    };
  };
  static logTimeWrap = _Debug.logWrapper("logTime");
  static logTimeAverageWrap = _Debug.logWrapper("logTimeAverage");
  static perfWrap = (fn, name = "default") => {
    return (...args) => {
      console.time(name);
      const ret = fn(...args);
      console.timeEnd(name);
      return ret;
    };
  };
  static CHANGED_CACHE = {};
  static logChanged(name, obj) {
    const prev = _Debug.CHANGED_CACHE[name];
    _Debug.CHANGED_CACHE[name] = obj;
    if (!prev) {
      return;
    }
    const allKeys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(obj)]);
    const changed = {};
    for (const key of allKeys) {
      const prevVal = prev[key];
      const nextVal = obj[key];
      if (!deepEqual(prevVal, nextVal)) {
        changed[key] = { prev: prevVal, next: nextVal };
      }
    }
    if (Object.keys(changed).length > 0) {
      console.info(`[${name}] changed:`, changed);
    }
  }
};
function deepEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!deepEqual(
      a[key],
      b[key]
    )) {
      return false;
    }
  }
  return true;
}
export {
  ACTIVE_THRESHOLD,
  ALLOWED_PASTE_MIME_TYPES,
  APP_NAME,
  ARROW_LABEL_FONT_SIZE_TO_MIN_WIDTH_RATIO,
  ARROW_LABEL_WIDTH_FRACTION,
  ARROW_TYPE,
  AppEventBus,
  BIND_MODE_TIMEOUT,
  BOUND_TEXT_PADDING,
  BinaryHeap,
  CANVAS_ONLY_ACTIONS,
  CANVAS_SEARCH_TAB,
  CJK_HAND_DRAWN_FALLBACK_FONT,
  CLASSES,
  CODES,
  COLORS_PER_ROW,
  COLOR_CHARCOAL_BLACK,
  COLOR_OUTLINE_CONTRAST_THRESHOLD,
  COLOR_PALETTE,
  COLOR_VOICE_CALL,
  COLOR_WHITE,
  CURSOR_TYPE,
  DARK_THEME_FILTER,
  DEFAULT_ADAPTIVE_RADIUS,
  DEFAULT_CANVAS_BACKGROUND_PICKS,
  DEFAULT_CHART_COLOR_INDEX,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
  DEFAULT_ELEMENT_PROPS,
  DEFAULT_ELEMENT_STROKE_COLOR_INDEX,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_PICKS,
  DEFAULT_EXPORT_PADDING,
  DEFAULT_FILENAME,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_STEP,
  DEFAULT_LASER_COLOR,
  DEFAULT_MAX_IMAGE_WIDTH_OR_HEIGHT,
  DEFAULT_PROPORTIONAL_RADIUS,
  DEFAULT_REDUCED_GLOBAL_ALPHA,
  DEFAULT_SIDEBAR,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TRANSFORM_HANDLE_SPACING,
  DEFAULT_UI_OPTIONS,
  DEFAULT_VERSION,
  DEFAULT_VERTICAL_ALIGN,
  DOUBLE_TAP_POSITION_THRESHOLD,
  DRAGGING_THRESHOLD,
  Debug,
  EDITOR_LS_KEYS,
  ELEMENT_LINK_KEY,
  ELEMENT_READY_TO_ERASE_OPACITY,
  ELEMENT_SHIFT_TRANSLATE_AMOUNT,
  ELEMENT_TRANSLATE_AMOUNT,
  ENCRYPTION_KEY_BITS,
  ENV,
  EPSILON,
  EVENT,
  EXPORT_DATA_TYPES,
  EXPORT_IMAGE_TYPES,
  EXPORT_SCALES,
  Emitter,
  FONT_FAMILY,
  FONT_FAMILY_FALLBACKS,
  FONT_FAMILY_GENERIC_FALLBACKS,
  FONT_METADATA,
  FONT_SIZES,
  FRAME_STYLE,
  GOOGLE_FONTS_RANGES,
  HYPERLINK_TOOLTIP_DELAY,
  IDLE_THRESHOLD,
  IMAGE_MIME_TYPES,
  IMAGE_RENDER_TIMEOUT,
  KEYS,
  KeyCodeMap,
  LIBRARY_DISABLED_TYPES,
  LIBRARY_SIDEBAR_TAB,
  LINE_CONFIRM_THRESHOLD,
  LINE_POLYGON_POINT_MERGE_DISTANCE,
  LOCAL_FONT_PROTOCOL,
  MAX_ALLOWED_FILE_BYTES,
  MAX_CUSTOM_COLORS_USED_IN_CANVAS,
  MAX_DECIMALS_FOR_SVG_EXPORT,
  MAX_ZOOM,
  MIME_TYPES,
  MINIMUM_ARROW_SIZE,
  MIN_FONT_SIZE,
  MIN_WIDTH_OR_HEIGHT,
  MIN_ZOOM,
  MOBILE_ACTION_BUTTON_BG,
  MONOSPACE_GENERIC_FONT,
  MQ_MAX_HEIGHT_LANDSCAPE,
  MQ_MAX_MOBILE,
  MQ_MAX_TABLET,
  MQ_MAX_WIDTH_LANDSCAPE,
  MQ_MIN_TABLET,
  MQ_MIN_WIDTH_DESKTOP,
  MQ_RIGHT_SIDEBAR_MIN_WIDTH,
  ORIG_ID,
  POINTER_BUTTON,
  POINTER_EVENTS,
  PromisePool,
  Queue,
  ROUGHNESS,
  ROUNDNESS,
  SANS_SERIF_GENERIC_FONT,
  SCROLL_TIMEOUT,
  SHIFT_LOCKING_ANGLE,
  SIDE_RESIZING_THRESHOLD,
  STATS_PANELS,
  STRING_MIME_TYPES,
  STROKE_WIDTH,
  SVG_DOCUMENT_PREAMBLE,
  SVG_NS,
  TAP_TWICE_TIMEOUT,
  TEXT_ALIGN,
  TEXT_AUTOWRAP_THRESHOLD,
  TEXT_TO_CENTER_SNAP_THRESHOLD,
  THEME,
  TITLE_TIMEOUT,
  TOOL_TYPE,
  TOUCH_CTX_MENU_TIMEOUT,
  URL_HASH_KEYS,
  URL_QUERY_KEYS,
  UserIdleState,
  VERSIONS,
  VERSION_TIMEOUT,
  VERTICAL_ALIGN,
  VersionedSnapshotStore,
  WINDOWS_EMOJI_FALLBACK_FONT,
  YOUTUBE_STATES,
  ZOOM_STEP,
  addEventListener,
  allowFullScreen,
  applyDarkModeFilter,
  arrayToList,
  arrayToMap,
  arrayToMapWithIndex,
  arrayToObject,
  assertNever,
  bytesToHexString,
  capitalizeString,
  castArray,
  chunk,
  cloneJSON,
  colorToHex,
  composeEventHandlers,
  createUserAgentDescriptor,
  debounce,
  deriveStylesPanelMode,
  distance,
  easeOut,
  easeToValuesRAF,
  escapeDoubleQuotes,
  exitFullScreen,
  findIndex,
  findLastIndex,
  focusNearestParent,
  getAllColorsSpecificShade,
  getDateTime,
  getExportSource,
  getFeatureFlag,
  getFontFamilyFallbacks,
  getFontFamilyString,
  getFontString,
  getFormFactor,
  getFrame,
  getGenericFontFamilyFallback,
  getGlobalCSSVariable,
  getGridPoint,
  getLineHeight,
  getNearestScrollableContainer,
  getSizeFromPoints,
  getSvgPathFromStroke,
  getUpdatedTimestamp,
  getVersion,
  getVerticalOffset,
  invariant,
  isAndroid,
  isAnyTrue,
  isArrowKey,
  isBounds,
  isBrave,
  isChrome,
  isColorDark,
  isDarwin,
  isDevEnv,
  isFirefox,
  isFullScreen,
  isIOS,
  isInputLike,
  isInteractive,
  isLatinChar,
  isLocalLink,
  isMemberOf,
  isMobileBreakpoint,
  isPrimitive,
  isProdEnv,
  isPromiseLike,
  isRTL,
  isReadonlyArray,
  isRunningInIframe,
  isSafari,
  isSelectionLikeTool,
  isServerEnv,
  isShallowEqual,
  isTabletBreakpoint,
  isTestEnv,
  isToolIcon,
  isTransparent,
  isWindows,
  isWritableElement,
  loadDesktopUIModePreference,
  mapFind,
  matchKey,
  memoize,
  muteFSAbortError,
  nFormatter,
  nextAnimationFrame,
  normalizeEOL,
  normalizeInputColor,
  normalizeLink,
  oneOf,
  preventUnload,
  promiseTry,
  queryFocusableElements,
  randomId,
  randomInteger,
  reduceToCommonValue,
  removeSelection,
  rescalePoints,
  reseed,
  resolvablePromise,
  rgbToHex2 as rgbToHex,
  safelyParseJSON,
  sceneCoordsToViewportCoords,
  selectNode,
  setDateTimeForTests,
  setDesktopUIMode,
  setFeatureFlag,
  shouldMaintainAspectRatio,
  shouldResizeFromCenter,
  shouldRotateWithDiscreteAngle,
  sizeOf,
  supportsEmoji,
  supportsResizeObserver,
  throttleRAF,
  toArray,
  toBrandedType,
  toIterable,
  toValidURL,
  tupleToCoors,
  updateActiveTool,
  updateObject,
  updateStable,
  viewportCoordsToSceneCoords,
  wrapEvent
};
//# sourceMappingURL=index.js.map
