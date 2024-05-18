const BLOCK_SIZE = 100;

let ensureSign = x => x > 0 ? "+" + x : "" + x

const FAST_MODE = (new URLSearchParams(location.search)).get('fast') == '1'

let KEY_CONTINUE = 'j'
let KEY_SWITCH = 'k'
let KEY_SELECT = 'j'

if (urlParams.fred) {
   KEY_CONTINUE = 't'
   KEY_SWITCH = 's'
   KEY_SELECT = 't'
}

function describeReward(value, description) {
  let cls = value > 0 ? 'win' : 'loss'
  return `<span class='${cls} points'>${ensureSign(value)}</span>
  for <span class='${cls}'>${description}</span>`
}


class Graph {
  constructor(adjacency) {
    // adjacency is a list of [state, children] pairs
    // Graph([[0, [1, 2]], [1, [3, 4]], [2, [5, 6]], ...]) // an example of a binary tree.

    this._adjacency = {}
    this.states = [];
    adjacency.forEach((successors, state) => {
      this.states.push(state);
      this._adjacency[state] = [...successors] // copy
    })
    this.states.sort();
  }

  successors(state) {
    return this._adjacency[state];
  }

  predecessors(state) {
    return this.states.filter(s => _.contains(this.successors(s), state))
  }

  shuffleSuccessors() {
    /*
    Modifies the graph, shuffling successors.
    */
    for (const state of this.states) {
      this._adjacency[state] = jsPsych.randomization.repeat(this._adjacency[state], 1);
    }
  }
}

function circleXY(N) {
  return _.range(N).map(idx => {
    const angle = 3 * Math.PI / 2 + (idx * 2 * Math.PI / N);
    let x = (Math.cos(angle) + 1) / 2;
    let y = (Math.sin(angle) + 1) / 2;
    return [x, y];
  });
}


class CircleGraph {
  constructor(options) {
    this.options = options = _.defaults(options, {
      consume: true,
      edgeShow: (() => true),
      show_steps: options.n_steps > 0,
      show_points: true,
      show_successor_rewards: true,
      keep_hover: true,
      revealed: false,
    })
    window.cg = this
    // successorKeys:  options.graphRenderOptions.successorKeys
    this.trialId = randomUUID()
    this.logEvent('graph.construct', this.options)
    this.root = $("<div>")
    .css({
      position: 'relative',
      textAlign: 'center',
    })

    this.rewards = _.clone(options.rewards ?? Array(options.images.length).fill(0))
    this.onStateVisit = options.onStateVisit ?? ((s) => {})
    this.score = options.score ?? 0

    // options.reward_graphics[0] = options.reward_graphics[0] ?? ""
    // options.graphics = this.rewards.map(x => options.reward_graphics[x])

    this.graph = new Graph(options.graph ?? Array(options.images.length).fill([]))
    this.el = renderCircleGraph(
      this.graph, options.goal,
      {
        edgeShow: options.edgeShow,
        successorKeys: options.successorKeys,
        stateGraphics: options.images,
        ...options.graphRenderOptions,

      }
    )
    if (options.consume) {
      this.rewards[options.start] = 0
      $(this.el.querySelector(`.GraphNavigation-State-${options.start}`)).addClass('consumed')
    }
    $(this.el).hide()

    this.graphContainer = $("<div>")
    .css({
      margin: 'auto',
      width: options.graphRenderOptions.width,
      height: options.graphRenderOptions.height,
    })
    .appendTo(this.root)
    .append(this.el)


    this.setRewards(this.rewards)
  }

  attach(div) {
    div.empty()
    this.root.appendTo(div)
    return this
  }

  async run(display, opt={}) {
    if (display) this.attach(display)

    if (this.options.mode == 'quizLocation') {
      return await this.quizLocationImage()
    } else if (this.options.mode == 'quizImage') {
      return await this.quizImageLocation()
    } else {
      this.setCurrentState(this.options.start)
      if (!this.options.skip_start) await this.showStartScreen()
      this.showGraph()
      if (this.options.hover_edges || this.options.hover_states || this.options.two_stage) {
        await this.plan()
      }
      await this.navigate()
    }
  }

  async showImageLocations(txt='start') {
    $(`.GraphNavigation-State`).addClass('is-visible')
    await this.centerButton(txt)
    $(`.GraphNavigation-State`).removeClass('is-visible')
  }

  async quizImageLocation() {
    logEvent('graph.quiz.image.start.')
    this.el.classList.add('hideStates')
    let images = this.options.images
    let N = images.length
    this.options.graph = Array(N).fill([])
    // this.setCurrentState(this.options.start)
    this.showGraph()
    let img = $('<img>').prop({width: 80})
    .addClass('absolute-centered')
    .appendTo(this.root)
    $(`.GraphNavigation-State`).css({cursor: 'pointer'})


    // show all states
    let showAll = async () => {
      logEvent('graph.quiz.image.showAll')
      img.hide()
      await this.showImageLocations()
      img.show()
    }

    await showAll()
    let done = false
    // query states one by one
    let todo = _.shuffle(_.range(0, N))
    while (todo.length) {
      let target = todo.pop()
      img.show()
      img.prop({src: 'static/images/' + images[target]})
      logEvent('graph.quiz.image.prompt', {target})

      let clicked = await this.clickStatePromise(undefined, this.options.timeLimit)
      img.hide()

      // feedback
      this.showState(target)
      if (clicked == target) {
        logEvent('graph.quiz.image.correct', {target})
        this.queryState(clicked).addClass('state-correct')
        await sleep(500)
      } else if (clicked == 'timeout') {
        logEvent('graph.quiz.image.timeout', {target})
        img.hide()
        let msg = $('<h2>').text('too slow!')
        .addClass('absolute-centered')
        .css({color: 'red', top: '45%'})
        .appendTo(this.root)
        await sleep(2000)
        msg.remove()
      } else {
        logEvent('graph.quiz.image.error', {target, clicked})
        this.queryState(clicked).addClass('state-incorrect')
        await sleep(1000)
      }
      this.queryState(clicked).removeClass('state-correct state-incorrect')
      this.hideState(target)

      // reset on error
      if (clicked != target) {
        await showAll()
        todo = _.shuffle(_.range(0, N))
      }
    }
  }

  async quizLocationImage() {
    logEvent('graph.quiz.location.start')
    this.el.classList.add('hideStates')
    let images = this.options.images
    let N = images.length
    this.options.graph = Array(N).fill([])
    this.showGraph()

    let imgArray = $("<div>")
    .addClass('absolute-centered')
    .css({width: 250})
    .appendTo(this.root)


    let imgDivs = images.map(name => {
      // for some reason we have to wrap the image in a div for click to work???
      let i = $('<img>').addClass('quiz-image').prop({width: 80, src: 'static/images/' + name})
      return $('<div>').append(i).css({
        display: 'inline-flex',
        // border: '2px white solid',
        cursor: 'pointer'
      })
    })

    for (let img of _.shuffle(imgDivs)) {
      img.appendTo(imgArray)
    }

    // show all states
    let showAll = async () => {
      logEvent('graph.quiz.location.showAll')
      imgArray.hide()
      await this.showImageLocations()
      imgArray.show()
    }

    await showAll()
    let done = false
    // query states one by one
    let todo = _.shuffle(_.range(0, N))
    while (todo.length) {
      let target = todo.pop()
      await sleep(500)
      logEvent('graph.quiz.location.prompt', {target})
      this.highlight(target)
      let clicked = Promise.any(Array.from(imgDivs.entries()).map(([i, img]) => {
        return new Promise((resolve, reject) => {
          img.click(() => {
            resolve(i)
          })
        })
      }))
      let timeout = sleep(this.options.timeLimit ?? 1e10)
      let response = await Promise.any([clicked, timeout])
      this.unhighlight(target)

      // feedback
      this.showState(target)
      if (response == target) {
        logEvent('graph.quiz.location.correct', {target})
        this.queryState(target).addClass('state-correct')
        await sleep(500)
      } else if (response == undefined) {
        logEvent('graph.quiz.location.timeout', {target})
        imgArray.hide()
        this.queryState(target).addClass('state-incorrect')
        let msg = $('<h2>').text('too slow!')
        .addClass('absolute-centered')
        .css({color: 'red', top: '45%'})
        .appendTo(this.root)
        await sleep(2000)
        msg.remove()
      } else {
        this.queryState(target).addClass('state-incorrect')
        logEvent('graph.quiz.location.error', {target, response})
        await sleep(1000)
      }
      this.queryState(target).removeClass('state-correct state-incorrect')
      this.hideState(target)

      // reset on error
      if (response != target) {
        await showAll()
        todo = _.shuffle(_.range(1, N))
      }
    }
  }

  logEvent(event, info={}) {
    info.trialId = this.trialId
    logEvent(event, info)
    if (this.logger_callback) this.logger_callback(event, info)
  }

  highlight(state, postfix='') {
    this.logEvent('graph.highlight', {state})
    $(`.GraphNavigation-State-${state}`).addClass(`GraphNavigation-State-Highlighted${postfix}`)
  }
  unhighlight(state, postfix='') {
    this.logEvent('graph.unhighlight', {state})
    $(`.GraphNavigation-State-${state}`).removeClass(`GraphNavigation-State-Highlighted${postfix}`)
  }

  async showGraph() {
    this.logEvent('graph.showGraph')
    // this.setupEyeTracking()

    if (this.options.show_description && this.options.reward_info) {
      $('<p>')
      .addClass('subtle-desc')
      .html(
        this.options.reward_info.map(info => describeReward(info.val, info.desc)).join('; ')
      )
      .addClass('graph-description')
      .css({transform: 'translate(0, -30px)'})
      .appendTo(this.el)
    }

    if (this.options.hide_states || this.options.hover_rewards) this.el.classList.add('hideStates');
    if (this.options.hide_edges || this.options.hover_edges) this.el.classList.add('hideEdges');
    $(`.ShadowState .GraphReward`).remove()
    $(`.ShadowState img`).remove()
    if (!this.options.show_steps) {
      $("#gn-steps").hide()
    }
    if (!this.options.show_points) {
      $("#gn-points").hide()
    }

    $(this.el).show()
  }

  async removeGraph() {
    $(this.el).animate({opacity: 0}, 300);
    await sleep(300)
    this.el.innerHTML = ""
    $(this.el).css({opacity: 1});
  }

  centerButton(txt='start') {
    return button(this.root, txt, {
      post_delay: 0,
      persistent: false,
      cls: 'absolute-centered',
    }).promise()
  }

  async showStartScreen() {
    this.logEvent('graph.showStartScreen')
    this.graphContainer.css({border: 'thin white solid'}) // WTF why does this fix positioning??

    if (this.options.start_message) {
      let msg = $('<div>').appendTo(this.graphContainer)
      .css({marginTop: 120})
      .appendTo(this.graphContainer)
      .text(this.options.start_message)
      await waitForKeypress([KEY_CONTINUE])
      msg.remove()
    }

    if (this.options.show_locations) {
      $(this.el).show()
      $('.GraphNavigation-edge,.GraphNavigation-arrow').hide()
      await this.showImageLocations('continue')
      $('.GraphNavigation-edge,.GraphNavigation-arrow').show()
      $(this.el).hide()
    }

    logEvent('graph.cross')
    let cross = $('<p>')
    .text('+')
    .addClass('absolute-centered')
    .css({fontSize: 60})
    .appendTo(this.graphContainer)

    await waitForKeypress([KEY_CONTINUE])
    cross.remove()

    logEvent('graph.describe')
    let desc = this.describeRewards().appendTo(this.graphContainer)
    await waitForKeypress([KEY_CONTINUE])
    desc.remove()
    // await sleep(200)
  }

  describeRewards() {
    let div = $('<div>').addClass('describe-rewards absolute-centered')

    for (let info of this.options.reward_info) {
      $('<p>').html(describeReward(info.val, info.desc))
      // .css({marginTop: 20})
      .appendTo(div)

      if (!this.options.hide_states) {
        let imgs = $('<div>').addClass('describe-rewards-box').appendTo(div)
        for (const t of info.targets) {
          $('<img>').prop('src', 'static/images/' + this.options.images[t]).prop('width', 80).appendTo(imgs)
        }
      }
    }
    return div
  }

  queryState(s) {
    return $(this.el.querySelector(`.GraphNavigation-State-${s}`))
  }

  setupEyeTracking() {
    this.data.state_boxes = {}
    this.graph.states.forEach(s => {
      this.data.state_boxes[s] = this.el.querySelector(`.GraphNavigation-State-${s}`).getBoundingClientRect()
    })
    this.data.gaze_cloud = []
    GazeCloudAPI.OnResult = d => {
      this.data.gaze_cloud.push(d)
    }
  }

  async plan(intro=false) {
    this.logEvent('graph.imagination.start')
    if (this.options.actions) return  // demo mode
    // don't double up the event listeners
    if (this.planningPhaseActive) return
    this.planningPhaseActive = true

    // $('.GraphNavigation').css('opacity', .7)
    $(this.el).addClass('imagination')


    let transition = '200ms'
    let eventType = 'mouseenter'
    if (this.options.reveal_by == 'click') {
      transition = '500ms'
      eventType = 'click'
    }
    $('.GraphNavigation-arrow,.GraphReward,.GraphNavigation-edge').css('transition', `opacity ${transition}`)

    for (const el of this.el.querySelectorAll('.State:not(.ShadowState)')) {
      const state = parseInt(el.getAttribute('data-state'), 10);
      el.classList.add('PathIdentification-selectable')
      el.addEventListener(eventType, (e) => {
        if (this.planningPhaseActive) {
          this.logEvent('graph.imagine', {state})
          this.hover(state)
        }
      });
    }

    if (!intro) {
      await this.enableExitImagination()
    }

    // this.unhoverAll()
    // await sleep(100)
  }

  async enableExitImagination() {
    await waitForKeypress([KEY_SWITCH])
    let stateDiv = $(`.GraphNavigation-State-${this.state}`)
    let ready = makePromise()
    this.exitImagination()
  }

  exitImagination() {
    this.logEvent('graph.imagination.end')
    this.hideAllEdges()
    this.el.classList.add('hideEdges')
    this.el.classList.add('hideStates')
    $('.graph-description').hide()
    $(this.el).removeClass('imagination')
    this.planningPhaseActive = false
    this.hover(this.state)
    $('.GraphNavigation').css('opacity', 1)
    $(`.GraphNavigation-State`).removeClass('PathIdentification-selectable')
    $('.GraphNavigation-arrow,.GraphReward,.GraphNavigation-edge').css('transition', '')
  }

  setCurrentState(state, options) {
    this.state = state;
    setCurrentState(this.el, this.graph, this.state, {
      edgeShow: this.options.edgeShow,
      successorKeys: this.options.successorKeys,
      onlyShowCurrentEdges: this.options.graphRenderOptions.onlyShowCurrentEdges,
      ...options,
    });
  }

  async keyTransition() {
    let choices = this.graph.successors(this.state)
    let idx = _.random(choices.length - 1)
    while (true) {
      this.highlightEdge(this.state, choices[idx])
      let key = await waitForKeypress([KEY_SWITCH, KEY_SELECT])
      if (key == KEY_SWITCH) {
        this.logEvent('graph.key.switch', {choice: choices[idx]})
        idx = (idx + 1) % choices.length
      } else {
        if (!this.disableSelect) {
          this.logEvent('graph.key.select', {choice: choices[idx]})
          break
        }
      }
    }
    return choices[idx]
  }

  clickTransition(options) {
    options = options || {};
    /*
    Returns a promise that is resolved with {state} when there is a click
    corresponding to a valid state transition.
    */
    const invalidStates = new Set(options.invalidStates || [this.state, this.options.goal]);

    for (const s of this.graph.states) {
      const el = this.el.querySelector(`.GraphNavigation-State-${s}`);
      if (invalidStates.has(s)) {
        el.classList.remove('PathIdentification-selectable');
      } else {
        el.classList.add('PathIdentification-selectable');
      }
    }

    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const el = $(e.target).closest('.PathIdentification-selectable').get(0);
        if (!el) {
          return;
        }
        e.preventDefault();
        const state = parseInt(el.getAttribute('data-state'), 10);

        this.el.removeEventListener('click', handler);
        resolve({state});
      }

      this.el.addEventListener('click', handler);
    });
  }

  async addPoints(points, state) {
    logEvent('graph.addPoints', {points})
    if (points == 0) {
      return
    }
    this.setScore(this.score + points)

    let cls = (points < 0) ? "loss" : "win"
    let sign = (points < 0) ? "" : "+"
    let pop = $("<span>")
    .addClass('pop ' + cls)
    .text(sign + points)
    .appendTo($(`.GraphNavigation-State-${state}`))

    await sleep(1500)
    pop.remove()
  }

  setScore(score) {
    this.score = score;
    $("#GraphNavigation-points").html(this.score)
  }

  hideAllEdges() {
    $(`.GraphNavigation-edge`).removeClass('is-visible');
    $(`.GraphNavigation-arrow`).removeClass('is-visible');
  }

  showOutgoingEdges(state) {
    this.hideAllEdges()
    for (const successor of this.graph.successors(state)) {
      this.showEdge(state, successor)
    }
  }

  async visitState(state, initial=false) {
    assert(typeof(1) == 'number')
    this.logEvent('graph.visit', {state, initial})
    this.onStateVisit(state);

    this.setCurrentState(state);
    if (!initial) {
      this.hideAllEdges()
      this.showState(state)
      this.addPoints(this.rewards[state], state)
      $(`.GraphNavigation-State-${state} > .GraphReward`).addClass('floatup')
      await sleep(800)
      // $(`.GraphNavigation-State-${state} img`).css({transition: 'opacity 300ms'})
      await $(`.GraphNavigation-State-${state} img`).animate({opacity: 0}, 200).promise()
      // await sleep(100)

      this.hover(state)  // why is this necessary?

      if (this.options.consume) {
        this.rewards[state] = 0
        $(`.GraphNavigation-State-${state}`).addClass('consumed')
        // let cls = (points < 0) ? "loss" : "win"
        // let sign = (points < 0) ? "" : "+"
        // $(`.GraphNavigation-State-${state} > .GraphReward`).remove()
      }
    }
  }

  async navigate(options) {
    let path = []
    this.logEvent('graph.navigate', options)
    options = options || {};
    if (this.state === undefined) {
      this.setCurrentState(this.options.start)
    }
    let goal = options.goal ?? this.options.goal
    const termination = options.termination || ((cg, state) => {
      return (this.graph.successors(state).length == 0) || state == goal
    });
    let stepsLeft = options.n_steps ?? this.options.n_steps;

    $("#GraphNavigation-steps").html(stepsLeft)
    this.visitState(this.state, true)

    if (this.options.actions) {
      await this.showDemo()
      return
    }

    if (this.options.forced_hovers) {
      await this.showForcedHovers()
      this.showOutgoingEdges(this.state)
    }

    while (true) { // eslint-disable-line no-constant-condition
      // State transition
      const g = this.graph;
      const state = await this.keyTransition();
      await this.visitState(state)
      path.push(state)

      stepsLeft -= 1;
      $("#GraphNavigation-steps").html(stepsLeft)
      if (termination(this, state) || stepsLeft == 0) {
        this.logEvent('graph.done')
        await sleep(500)
        $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
        if (options.leave_state) {
          // $(`.GraphNavigation-State-${state}`).animate({opacity: .1}, 500)
        } else if (options.leave_open) {
          $(`.GraphNavigation-State-${state}`).animate({opacity: 0}, 500)  // works because shadow state
          $('.State .GraphReward').animate({opacity: 0}, 500)
          await sleep(1000)
          // $(this.el).animate({opacity: 0}, 500); await sleep(500)
          // $(this.el).empty()
        } else {
          await sleep(200)
          $(this.el).animate({opacity: 0}, 200)
          await sleep(500)
        }
        // $(this.el).addClass('.GraphNavigation-terminated')


        $(`.GraphNavigation-current`).removeClass('GraphNavigation-current');
        // this.setCurrentState(undefined)
        break;
      }
      // await sleep(200);
      // await sleep(5)
    }
    return path
  }

  async showDemo() {
    // if (this.options.actions.length == 0) return

    let a0 = this.options.actions[0]
    if (a0?.type == "fixate") this.highlight(a0.state, '2')
    await getKeyPress(['t', 'space'])
    if (a0?.type == "fixate") this.unhighlight(a0.state, '2')

    for (var i = 0; i < this.options.actions.length; i++) {
      let a = this.options.actions[i]
      let a2 = this.options.actions[i+1]
      // this.highlight(a.state, '3')
      if (a2?.type == "fixate") this.highlight(a2.state, '2')
      if (a.type == "move") {
        this.hover(a.state)
        this.visitState(a.state)
      } else {
        this.hover(a.state)
      }
      await getKeyPress(['t', 'space'])
      // this.unhighlight(a.state, '3')
      this.unhighlight(a2?.state, '2')
    }
  }

  async showForcedHovers(start=0, stop) {
    $(this.el).addClass('forced-hovers')
    this.logEvent('graph.forced.start')
    let delay = 1000
    // await sleep(delay)
    this.hover(this.options.expansions[0][0])
    for (var i = start; i < (stop ?? this.options.expansions.length); i++) {
      let [s1, s2] = this.options.expansions[i]
      // this.showEdge(s1, s2)
      await sleep(delay)
      this.highlight(s2)
      await this.hoverStatePromise(s2)
      this.unhighlight(s2)
      // await getKeyPress()

      // this.hideEdge(s1, s2)
      this.logEvent('graph.forced.hover', {s1, s2, duration: delay})
      this.hover(s2)
      // this.showState(s2)
      // await sleep(delay)

      // this.hideState(s2)
    };
    await sleep(delay)
    $(this.el).removeClass('forced-hovers')
    this.logEvent('graph.forced.end')
  }

  clickStatePromise(state, timeLimit=null) {
    return new Promise((resolve, reject) => {
      if (timeLimit) {
        sleep(timeLimit).then(()=>resolve('timeout'))
      }
      if (state == undefined) {
        $('.GraphNavigation-State').on('click', function() {
          $('.GraphNavigation-State').off('click')
          resolve(parseInt(this.getAttribute('data-state'), 10))
        })
      } else {
        $(`.GraphNavigation-State-${state}`).css('cursor', 'pointer')
        $(`.GraphNavigation-State-${state}`).one('click', () => {
          $(`.GraphNavigation-State-${state}`).css('cursor', '')
          resolve(state)
        })
      }
    })
  }

  hoverStatePromise(state) {
    return new Promise((resolve, reject) => {
      $(`.GraphNavigation-State-${state}`).one('mouseover', () => {
        resolve()
      })
    })
  }

  highlightEdge(s1, s2, opt={}) {
    if (!opt.leavePrevious) {
      $(`.GraphNavigation-edge,.GraphNavigation-arrow`).removeClass('HighlightedEdge')
    }
    $(`.GraphNavigation-edge-${s1}-${s2}`).addClass('HighlightedEdge')
  }

  showState(state) {
    $(`.GraphNavigation-State-${state}`).addClass('is-visible')
  }

  hideState(state) {
    this.logEvent('graph.hide_state', {state})
    $(`.GraphNavigation-State-${state}`).removeClass('is-visible')
  }

  showEdge(state, successor) {
    $(`.GraphNavigation-edge-${state}-${successor}`).addClass('is-visible')
    $(`.GraphNavigation-arrow-${state}-${successor}`).addClass('is-visible')
  }

  hideEdge(state, successor) {
    $(`.GraphNavigation-edge-${state}-${successor}`).removeClass('is-visible')
  }

  unhoverAll() {
    $(`.GraphNavigation-State`).removeClass('is-visible')
    $(`.GraphNavigation-State`).removeClass('hovered')
    this.hideAllEdges()
  }

  async hover(state) {
    // if (!(this.options.hover_edges || this.options.hover_rewards)) return
    // this.logEvent('hover', {state})
    // if (this.options.forced_hovers) return
    if (this.options.keep_hover) {
      this.unhoverAll()
    }
    if (this.options.hover_states) {
      if (this.options.show_hovered_reward) this.showState(state)
      $(`.GraphNavigation-State-${state}`).addClass('hovered')
    }
    if (this.options.hover_edges || this.options.two_stage) {
      for (const successor of this.graph.successors(state)) {
        this.showEdge(state, successor)
        if (this.options.show_successor_rewards) this.showState(successor)
      }
      if (this.options.show_predecessors) {
        for (const pred of this.graph.predecessors(state)) {
          this.showEdge(pred, state)
        }
      }
    }
  }

  unhover(state) {
    if (this.options.forced_hovers) return
    if (this.options.keep_hover) return
    $(`.GraphNavigation-State-${state}`).removeClass('hovered')

    if (this.options.show_hovered_reward) this.hideState(state)
    for (const successor of this.graph.successors(state)) {
      this.hideEdge(state, successor)
      if (this.options.show_successor_rewards) this.hideState(successor)
    }
    if (this.options.show_predecessors) {
      for (const pred of this.graph.predecessors(state)) {
        this.hideEdge(pred, state)
      }
    }
  }

  loadTrial(trial) {
    if (trial.start != undefined) this.setCurrentState(trial.start)
    this.setRewards(trial.rewards)
    this.options.n_steps = trial.n_steps ?? this.options.n_steps
  }

  setReward(state, reward) {
    this.rewards[state] = parseFloat(reward)
  }

  setRewards(rewards) {
    for (let s of _.range(this.rewards.length)) {
      this.setReward(s, s == this.state ? 0 : rewards[s])
    }
  }
}


const stateTemplate = (state, options) => {
  let cls = `GraphNavigation-State-${state}`;
  if (options.goal) {
    cls += ' GraphNavigation-goal';
  }
  return `
  <div class="State GraphNavigation-State ${cls || ''}" style="${options.style || ''}" data-state="${state}">
    <img src="static/images/${options.image}" />
  </div>
  `;
    // <img src="${graphicsUrl(graphic)}" dragggable=false/>
};

const renderSmallEmoji = (graphic, cls) => `
<img style="height:40px" src="${graphicsUrl(graphic)}" />
`;

function keyForCSSClass(key) {
  // Using charcode here, for unrenderable keys like arrows.
  return key.charCodeAt(0);
}

function graphXY(graph, width, height, scaleEdgeFactor, fixedXY) {
  /*
  This function computes the pixel placement of nodes and edges, given the parameters.
  */
  assert(0 <= scaleEdgeFactor && scaleEdgeFactor <= 1);

  // We make sure to bound our positioning to make sure that our blocks are never cropped.
  const widthNoMargin = width - BLOCK_SIZE;
  const heightNoMargin = height - BLOCK_SIZE;

  // We compute bounds for each dimension.
  const maxX = Math.max.apply(null, fixedXY.map(xy => xy[0]));
  const minX = Math.min.apply(null, fixedXY.map(xy => xy[0]));
  const rangeX = maxX-minX;
  const maxY = Math.max.apply(null, fixedXY.map(xy => xy[1]));
  const minY = Math.min.apply(null, fixedXY.map(xy => xy[1]));
  const rangeY = maxY-minY;

  // We determine the appropriate scaling factor for the dimensions by comparing the
  // aspect ratio of the bounding box of the embedding with the aspect ratio of our
  // rendering viewport.
  let scale;
  if (rangeX/rangeY > widthNoMargin/heightNoMargin) {
    scale = widthNoMargin / rangeX;
  } else {
    scale = heightNoMargin / rangeY;
  }

  // We can now compute an appropriate margin for each dimension that will center our graph.
  let marginX = (width - rangeX * scale) / 2;
  let marginY = (height - rangeY * scale) / 2;

  // Now we compute our coordinates.
  const coordinate = {};
  const scaled = {};
  for (const state of graph.states) {
    let [x, y] = fixedXY[state];
    // We subtract the min, rescale, and offset appropriately.
    x = (x-minX) * scale + marginX;
    y = (y-minY) * scale + marginY;
    coordinate[state] = [x, y];
    // We rescale for edges/keys by centering over the origin, scaling, then translating to the original position.
    scaled[state] = [
      (x - width/2) * scaleEdgeFactor + width/2,
      (y - height/2) * scaleEdgeFactor + height/2,
    ];
  }

  return {
    coordinate,
    scaled,
    edge(state, successor) {
      return normrot(scaled[state], scaled[successor]);
    },
  };
}

function normrot([x, y], [sx, sy]) {
  // This function returns the length/norm and angle of rotation
  // needed for a line starting at [x, y] to end at [sx, sy].
  const norm = Math.sqrt(Math.pow(x-sx, 2) + Math.pow(y-sy, 2));
  const rot = Math.atan2(sy-y, sx-x);
  return {norm, rot};
}

function parseHTML(html) {
  var parser = new DOMParser();
  var parsed = parser.parseFromString(html, 'text/html');
  const children = parsed.getRootNode().body.children;
  if (children.length != 1) {
    throw new Error(`parseHTML can only parse HTML with 1 child node. Found ${children.length} nodes.`);
  }
  return children[0];
}

function renderCircleGraph(graph, goal, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  const successorKeys = options.successorKeys;
  /*
  fixedXY: Optional parameter. This requires x,y coordinates that are in
  [-1, 1]. The choice of range is a bit arbitrary; results from code that assumes
  the output of sin/cos.
  */
  // Controls how far the key is from the node center. Scales keyWidth/2.
  const keyDistanceFactor = options.keyDistanceFactor || 1.4;

  const width = options.width;
  const height = options.height;

  const xy = graphXY(
    graph,
    width, height,
    // Scales edges and keys in. Good for when drawn in a circle
    // since it can help avoid edges overlapping neighboring nodes.
    options.scaleEdgeFactor || 0.95,
    options.fixedXY,
  );

  const states = graph.states.map(state => {
    const [x, y] = xy.coordinate[state];
    return stateTemplate(state, {
      image: options.stateGraphics[state],
      probe: state == options.probe,
      goal: state == goal,
      style: `transform: translate(${x - BLOCK_SIZE/2}px,${y - BLOCK_SIZE/2}px);`,
    });
  });

  function addArrow(state, successor, norm, rot) {
      const [x, y] = xy.scaled[state];
      const [sx, sy] = xy.scaled[successor];
      arrows.push(`
        <div class="GraphNavigation-arrow GraphNavigation-edge-${state}-${successor}"
        style="
        transform-origin: center;
        transform:
          translate(${sx-35}px, ${sy-35}px)
          rotate(${rot}rad)
          translate(-30px)
          rotate(90deg)
        ;">
        <svg height="70" width="70" style="display: block; fill: currentColor; stroke: currentColor">
            <polygon points="
            35  , 38
            29  , 50
            41 , 50
          " class="triangle" />
        </svg>
        </div>
      `);
    }

  // HACK for the score animation
  let shadowStates = states.map(state => {
    return state
    .replaceAll("-State-", "-ShadowState-")
    .replaceAll("\"State ", "\"State ShadowState ")
  })

  const succ = [];
  const arrows = [];
  for (const state of graph.states) {
    let [x, y] = xy.scaled[state];
    graph.successors(state).forEach((successor, idx) => {
      // if (state >= successor) {
      //   return;
      // }
      const e = xy.edge(state, successor);
      // const opacity = options.edgeShow(state, successor) ? 1 : 0;
      // opacity: ${opacity};
      succ.push(`
        <div class="GraphNavigation-edge GraphNavigation-edge-${state}-${successor}" style="
        width: ${e.norm}px;
        transform: translate(${x}px,${y-1}px) rotate(${e.rot}rad);
        "></div>
      `);

      // We also add the key labels here
      addArrow(state, successor, e.norm, e.rot);
      // addArrow(successor, state, e.norm);
    });
  }

  return parseHTML(`
  <div class="GraphNavigation withGraphic" style="width: ${width}px; height: ${height}px;">
    ${arrows.join('')}
    ${succ.join('')}
    ${shadowStates.join('')}
    ${states.join('')}
  </div>
  `);
}

function queryEdge(root, state, successor) {
  /*
  Returns the edge associated with nodes `state` and `successor`. Since we only
  have undirected graphs, they share an edge, so some logic is needed to find it.
  */
  return root.querySelector(`.GraphNavigation-edge-${state}-${successor}`);
}

function setCurrentState(display_element, graph, state, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  // showCurrentEdges enables rendering of current edges/keys. This is off for PathIdentification and AcceptReject.
  options.showCurrentEdges = typeof(options.showCurrentEdges) === 'undefined' ? true : options.showCurrentEdges;
  const allKeys = _.uniq(_.flatten(options.successorKeys));

  // Remove old classes!
  function removeClass(cls) {
    const els = display_element.querySelectorAll('.' + cls);
    for (const e of els) {
      e.classList.remove(cls);
    }
  }
  removeClass('GraphNavigation-current')
  removeClass('GraphNavigation-currentEdge')
  // removeClass('GraphNavigation-currentKey')
  for (const key of allKeys) {
    removeClass(`GraphNavigation-currentEdge-${keyForCSSClass(key)}`)
    // removeClass(`GraphNavigation-currentKey-${keyForCSSClass(key)}`)
  }

  // Can call this to clear out current state too.
  if (state == null) {
    return;
  }

  // Add new classes! Set current state.
  display_element.querySelector(`.GraphNavigation-State-${state}`).classList.add('GraphNavigation-current');

  if (!options.showCurrentEdges) {
    return;
  }

  if (options.onlyShowCurrentEdges) {
    for (const el of display_element.querySelectorAll('.GraphNavigation-edge,.GraphNavigation-arrow')) {
    // for (const el of display_element.querySelectorAll('.GraphNavigation-edge')) {
      el.style.opacity = 0;
    }
  }

  graph.successors(state).forEach((successor, idx) => {
    if (!options.edgeShow(state, successor)) {
      return;
    }

    // Set current edges
    let el = queryEdge(display_element, state, successor);
    el.classList.add('GraphNavigation-currentEdge');
    // el.classList.add(`GraphNavigation-currentEdge-${keyForCSSClass(successorKeys[idx])}`);
    if (options.onlyShowCurrentEdges) {
      el.style.opacity = 1;
    }

    // Now setting active keys
    // el = display_element.querySelector(`.GraphNavigation-arrow-${state}-${successor}`);
    // el.classList.add('GraphNavigation-currentKey');
    // if (options.onlyShowCurrentEdges) {
    //   el.style.opacity = 1;
    // }
  });
}

function renderKeyInstruction(keys) {
  function renderInputInstruction(inst) {
    return `<span style="border: 1px solid black; border-radius: 3px; padding: 3px; font-weight: bold; display: inline-block;">${inst}</span>`;
  }

  if (keys.accept == 'Q') {
    return `${renderInputInstruction('Yes (q)')} &nbsp; ${renderInputInstruction('No (p)')}`;
  } else {
    return `${renderInputInstruction('No (q)')} &nbsp; ${renderInputInstruction('Yes (p)')}`;
  }
}
