
// makeGlobal({myObject}) -> myObject in debug console
function makeGlobal(obj) {
  Object.assign(window, obj)
}





class Bonus {
  constructor(options) {
    let {points_per_cent, initial = 0} = options;
    assert(typeof(points_per_cent) == 'number',
      `points_per_cent must be a number, but is ${JSON.stringify(points_per_cent)}`)
    assert(typeof(initial) == 'number',
      `initial must be a number, but is ${JSON.stringify(points_per_cent)}`)
    this.points = this.initial = initial
    this.points_per_cent = points_per_cent
  }
  addPoints(points) {
    this.points += points
  }
  dollars() {
    let cents = Math.max(0, Math.round(this.points / this.points_per_cent))
    return cents / 100
  }
  reportBonus() {
    return `Your current bonus is $${this.dollars().toFixed('2')}`
  }
  describeScheme() {
    return "one cent for every " + numString(this.points_per_cent, "point", {skip_one: true})
  }
}

function numString(n, noun, options={}) {
  if (options.skip_one && n == 1) return noun
  let res = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n]
  if (noun) {
    if (n != 1) {
      noun += "s"
    }
    res += " " + noun
  }
  return res
}

class ConditionBuilder {
  constructor(condition) {
    this.state = condition;
  }

  choose(choices, {rand=false, pop=false} = {}) {
    let indices = (arr) => [...arr.keys()];
    let range = (n) => indices(Array(n));
    let randInt = (n) => Math.floor(Math.random() * n);

    if (typeof choices == 'number') {
      choices = range(choices);
    }
    let i;
    if (rand) {
      i = randInt(choices.length);
    } else {
      i = this.state % choices.length;
      this.state = Math.floor(this.state / choices.length);
    }
    return pop ? choices.splice(i, 1)[0] : choices[i];
  }

  chooseMulti(choicesObj) {
    let result = {};
    for (let [key, choices] of Object.entries(choicesObj)) {
      if (Array.isArray(choices)) {
        result[key] = this.choose(choices);
      } else {
        result[key] = choices;
      }
    }
    return result;
  }
}

function conditionParameters(condition, choicesObj) {
  return new ConditionBuilder(condition).chooseMulti(choicesObj)
}


function enforceScreenSize(width, height, opts={}) {
  display = $(opts.display ?? '#display')
  display.css({
    width: width,
    height: height,
  })
  if (opts.outline === true) {
    opts.outline = '3px dotted gray'
  }

  if (opts.testMode) {
    display.css({
      'z-index': 1,
      'box-sizing': 'content-box',
      'outline': opts.outline,
      'outline-offset': '5px'
    })
  }

  let warning = $("<div>")
    .addClass("alert alert-warning center")
    .css({
      width: 400,
      // 'position': 'absolute',
      // 'top': '30%',
      margin: "auto",
      "margin-top": "100px",
    })
    .appendTo(document.body)

  function resetWarning() {
    warning
      .html(
        `
      <h4>Screen too small</h4>

      <p>Your window isn't big enough to run the experiment. Please try expanding the window.
      It might help to use full screen mode.
    `
      )
      .hide()

    $("<button>")
      .addClass("btn btn-primary")
      .css("margin-top", "20px")
      .text("enter fullscreen")
      .appendTo(warning)
      .click(async () => {
        document.documentElement.requestFullscreen()
        await sleep(1000)
        warning.html(`
        <h4>Darn, still not big enough!</h4>

        <p>You can also try zooming out a bit with <code>cmd/ctrl minus</code>.
      `)
      })
  }
  resetWarning()

  function enforcer() {
    if (opts.autoScale ?? opts.testMode) {
      let wr = window.innerWidth / width
      let hr = window.innerHeight / height
      let scale = Math.min(wr, hr)
      if (scale < 1) {
        display.css({
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        })
      }
    }
    if (opts.testMode) return
    if (window.innerWidth < width || window.innerHeight < height) {
      warning.show()
      display.hide()
    } else {
      warning.hide()
      resetWarning()
      display.show()
    }
  }
  window.addEventListener("resize", enforcer)
  enforcer()
  return enforcer
}


function makePromise() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.resolve = resolve
  promise.reject = reject
  return promise
}

function hex2rgb(hex) {
  // Convert hex color to rgb
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

async function runTimeline(...blocks) {
  let start = _.map(blocks, 'name').indexOf(urlParams.block)
  if (start != -1) {
    blocks = blocks.slice(start)
  }
  for (const block of blocks) {
    logEvent('timeline.start.' + block.name)
    await block()
    logEvent('timeline.end.' + block.name)
  }
}

class EventListeners {
  constructor() {
    this.listeners = []
  }
  on(type, handler, options) {
    this.listeners.push([type, handler, options])
    document.addEventListener(type, handler, options)
  }
  clear() {
    for (let [ltype, handler, options] of this.listeners) {
      document.removeEventListener(ltype, handler, options)
    }
    this.listeners.length = 0 // weird way to clear an array
  }
}
const globalListeners = new EventListeners()

function updateExisting(target, src) {
  Object.keys(target)
        .forEach(k => target[k] = (src.hasOwnProperty(k) ? src[k] : target[k]));
}

function maybeJson(s) {
  try {
    return JSON.parse(s);
  } catch (error) {
    return s;
  }
};


function mod(n, k) {
  return ((n % k) + k) % k
}

const cartesian = (...a) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));

let _converter = new showdown.Converter();

function markdown(txt) {
  // Remove leading spaces so as not to interpret indented
  // blocks as code blocks. Use fenced code blocks instead.
  return _converter.makeHtml(txt.replace(/^[ ]+/gm, ''));
};

function sleep(ms) {
  return new Promise(function(resolve) {
    return window.setTimeout(resolve, ms);
  });
};


function assert(val, msg='(no details)') {
  if (!val) {
    throw new Error('Assertion Error: ' + msg);
  }
  return val;
};
