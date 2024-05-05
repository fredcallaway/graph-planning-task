const DEFAULT_INSTRUCT_HELP= `
  Use the << and >> buttons to flip through the sections. You have
  to follow all the instructions on a page before you can advance to the next one.
  If you get stuck, try clicking << and then >> to start the section over.
`

class GraphInstructions extends Instructions {
  constructor(options={}) {
    super({...options, promptHeight: 100, width: 800})
    this.trials = options.trials
    window.instruct = this


    if (!PARAMS.use_process_tracing) {
      this.stages = this.stages.filter(stage => {
        return !stage.name.startsWith('stage_hover')
      })
    }
  }

  // the stages run in the order that they're defined
  // you can jump to a specific stage using it's position e.g.
  // http://127.0.0.1:8000/?instruct=2

  async stage_welcome() {
    this.setPrompt(`
      Thanks for participating! We'll start with some quick instructions.

      _psst: you can use the arrows above to flip through the pages_
    `)

    await this.button()
    this.runNext()
  }

  async stage_intro() {
    let trial = {...this.trials.intro[0], revealed: true, description: null}
    let cg = new CircleGraph(trial).attach(this.content);
    $(`.GraphNavigation-State img`).hide()
    cg.showGraph()

    this.setPrompt(`Welcome! In this experiment, you will play a game on the board shown below.`)
    await this.button()

    this.setPrompt(`Your current location on the board is highlighted in blue.`)
    cg.setCurrentState(trial.start)
    await this.button()

    this.setPrompt(`Your current location on the board is highlighted in blue.`)

    this.setPrompt(`You can move by clicking on a location that has an arrow pointing<br>from your current location. Try it now!`)
    let next_states = cg.graph.successors(trial.start)
    for (const s of next_states) {
      $(`.GraphNavigation-State-${s}`).addClass('GraphNavigation-State-Highlighted')
    }
    await cg.navigate({n_steps: 1, leave_state: true})
    $(`.GraphNavigation-State`).removeClass('GraphNavigation-State-Highlighted')

    this.setPrompt(`
      The round ends when you get to a location with no outgoing connections.
      Finish the round to continue.
    `)

    await cg.navigate()
    cg.removeGraph()
    this.runNext()
  }

  async stage_images() {
    this.setPrompt(`
      The goal of the game is to collect these images. Try it out!
    `)
    let trial = {...this.trials.intro[1], revealed: true, description: null}
    cg = new CircleGraph(trial).attach(this.content);
    cg.showGraph()
    cg.setCurrentState(trial.start)

    await cg.navigate({n_steps: 1, leave_state: true})
    this.setPrompt(`
      Nice! That image was worth two points. Some images will actually
      cost you points though...
    `)
    await cg.navigate()
    this.runNext()
  }

  async stage_reward_description() {
    this.setPrompt(`
      The value of the images changes on each round. Before the round,
      we will tell you which images are good. All the other images
      are worth -1 points.
    `)
    this.content.html(new CircleGraph(this.trials.intro_describe[0]).describeRewards())
    await this.button()

    this.setPrompt(`
      The number of good images and their value changes from round to round.
      Click to see a few more examples.
    `)
    this.content.html(new CircleGraph(this.trials.intro_describe[1]).describeRewards())

    for (let trial of this.trials.intro_describe.slice(2)) {
      let btn = button(this.prompt, 'next')
      await btn.promise()
      btn.remove()
      this.content.empty()
      cg = new CircleGraph(trial);
      cg.describeRewards().appendTo(this.content)
    }


    await this.button()
    this.runNext()
  }

  async stage_practice_revealed() {
    this.setPrompt("Let's try a few practice rounds.")
    for (let trial of this.trials.practice_revealed) {
      let cg = new CircleGraph({...trial, revealed: true})
      await cg.run(this.content)
    }
    this.runNext()
  }

  async stage_hover() {
    this.setPrompt("Just one more thing...")
    let trial = {...this.trials.intro_hover[0], revealed: true}

    FAST_MODE || await this.button()

    this.setPrompt(`So far we've been showing you all the connections.`)
    cg = new CircleGraph(trial).attach(this.content);
    cg.showGraph()
    cg.setCurrentState(trial.start)
    FAST_MODE || await this.button()

    this.setPrompt("But in the real game, they're hidden!")
    FAST_MODE || await sleep(600)
    FAST_MODE || $('.GraphNavigation-arrow,.GraphNavigation-edge').css('transition', 'opacity 1500ms')
    cg.el.classList.add('hideEdges')
    cg.options.hover_edges = true

    FAST_MODE || await sleep(1500)
    $('.GraphNavigation-arrow,.GraphNavigation-edge').css('transition', '')
    this.cg = cg
    this.skipNextClear()
  }

  async stage_hover_instruct() {
    let cg;
    if ($('.GraphNavigation').length && this.cg) {
      cg = this.cg
      this.cg = undefined
    } else {
      let trial = {...this.trials.intro_hover[0], revealed: false}
      cg = new CircleGraph(trial).attach(this.content);
      cg.options.hover_edges = true
      cg.showGraph()
      cg.setCurrentState(trial.start)
    }

    let hidden_things = "points and connections"
    if (cg.options.forced_hovers) {
      await this.forcedHoverInstructions(cg, hidden_things)
    } else {
      await this.freeHoverInstructions(cg, hidden_things)
    }
    this.runNext()
  }

  async stage_incentives() {
    this.setPrompt(`
      _What's in it for me?_ you might be asking. Well, we thought of that!
      Unlike other experiments you might have done, we don't have a fixed number of rounds.
    `)
    await this.button()
    let goal
    if (PARAMS.time_limit) {
      goal = 'earn the most money'
      let time_limit = PARAMS.time_limit / 60
      this.setPrompt(`
        Instead, you will have **${2*time_limit} minutes** to collect **as many points as you can.**
        At the end of the experiment, we will convert those points into a cash bonus:
        **${this.options.bonus.describeScheme()}.**
      `)
      await this.button()
      this.setPrompt(`
        The ${2*time_limit} minutes will be broken up into two stages of ${time_limit} minutes each.
        We'll tell you more about the second stage later.
      `)
      await this.button()
    } else {
      goal = 'finish the study as quickly as possible'
      this.setPrompt(`
        Instead, you will do as **as many rounds as it takes** to earn **${PARAMS.score_limit} points.**
      `)
      await this.button()
    }
    this.setPrompt(`
      To ${goal}, you'll have to balance making fast choices and selecting the
      best possible path.
    `)
    await this.button()
    this.runNext()
  }

  async stage_final() {
    // I suggest keeping something like this here to warn participants to not refresh

    this.setPrompt(`
      That's it! You're ready to begin the first main stage of the experiment.

      <br><br>
      <div class="alert alert-danger">
        <b>Warning!</b><br>
        Once you complete the instructions, <strong>you cannot refresh the page</strong>.
        If you do, you will get an error message and you won't be able to complete the
        study.
      </div>
    `)
    let question = 'Are you going to refresh the page after completing the instructions?'
    let radio = radio_buttons(this.prompt, question, ['yes', 'no'])
    let post = $('<div>').appendTo(this.prompt)
    let no = makePromise()
    let done = false
    radio.click((val) => {
      if (val == 'yes') {
        post.html("Haha... But seriously.")
      } else {
        no.resolve()
      }
    })
    await no
    radio.buttons().off()
    radio.buttons().prop('disabled', true)
    post.html('Good. No refreshing!')
    await this.button('finish instructions')
    this.runNext() // don't make them click the arrow
  }

  describeRewards() {
    let rewardGraphics = Object.fromEntries(_.zip(PARAMS.rewards, PARAMS.images))
    // let descriptions = vals.map(reward => {
    //   return `${renderSmallEmoji(rewardGraphics[reward])}is worth ${reward}`
    // })
    // return descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)

    let vv =  PARAMS.rewards.map(reward => `
      <div class="describe-rewards-box">
      <img src="${rewardGraphics[reward]}" width=60/>
      <br>
      ${ensureSign(reward)}
      </div>
    `).join("")
    return `
      <div class="describe-rewards">
        ${vv}
      </div>
    `
  }

  async forcedHoverInstructions(hidden_things) {
    this.setPrompt(`On each round, we will show you parts of the board, one at a time.`)
    await this.button()

    this.setPrompt(`Your current location will turn pink during this phase of the game.`)
    $(cg.el).addClass('forced-hovers')
    await this.button()

    this.setPrompt(`For example, here is one location you could move to from your initial location.`)
    // let hover = cg.showForcedHovers(0, 1)
    let [s1, s2] = trial.expansions[0]
    cg.showEdge(s1, s2)
    await this.button()

    this.setPrompt(`Press any key to reveal the number of points at that location.`)
    // cg.highlight(s2)
    await getKeyPress()
    this.setPrompt(`Thats it!`)

    cg.unhighlight(s2)
    cg.showState(s2)
    await this.button()

    this.setPrompt('Keep pressing a key to see more of the board.')
    cg.hideState(s2)
    cg.hideEdge(s1, s2)
    await cg.showForcedHovers(1)
    this.setPrompt(`Your current location will turn back to blue when it's time to select your moves.`)
    await this.button()
    this.setPrompt(`Good luck!`)
    cg.options.expansions = []
    await cg.navigate()
  }

  async freeHoverInstructions(cg) {
    $(cg.el).addClass('hideEdges')
    this.setPrompt(`
     But don't worry! Before you select your moves, you can see the
     connections in <i><b>imagination mode</b></i>.
    `)
    FAST_MODE || await this.button()

    let action_text = {
      'click': 'clicking on it',
      'hover': 'hovering the mouse over it',
    }[cg.options.reveal_by]

    this.setPrompt(`
      In imagination mode, you can imagine being in any location by ${action_text}.
      This will show you the locations you could visit next from that one.
    `)
    FAST_MODE || await this.button()

    this.setPrompt(`
      Try it out! Hover over every location to continue.
    `)
    cg.plan(true)

    let setEqual = (xs, ys) => xs.size === ys.size && [...xs].every((x) => ys.has(x));
    let hovered = new Set([cg.state])
    let all_states = new Set(cg.graph.states)
    let done = false
    let reminded = false

    let hoveredAll = makePromise();

    cg.logger_callback = (event, info) => {
      if (!done && event == 'graph.imagine') {
        hovered.add(info.state)
        console.log('callback', String(info.state))
        if (cg.options.show_successor_rewards && !reminded && terminal.includes(String(info.state))) {
         this.setPrompt(`
           If nothing appears, it means that location has no outgoing connections.
           <br>
           Click on every location to continue.
         `)
        }
        if (setEqual(hovered, all_states)) {
          done = true
          hoveredAll.resolve()
        }
      }
    }
    sleep(10000).then(() => {
      reminded = true
      let action_text = {
       'click': 'Click on',
       'hover': 'Hover the mouse over',
      }[cg.options.reveal_by]
      if (done) return
      this.setPrompt(`
        <b>${action_text} every location to continue!</b><br>
      `)
    })
    await hoveredAll

    this.setPrompt(`
      When you're ready to select your moves, click on your current location (the blue one).
    `)
    await cg.enableExitImagination()

    this.setPrompt(`
      Now you can select a path. By the way, on this round,
      items matching: <b>${cg.options.description}</b> are worth
      <b>${numString(cg.options.value, 'point')}</b>
    `)
    await cg.navigate()
  }
}