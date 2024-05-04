ERROR_EMAIL = 'fredcallaway@gmail.com'
PROLIFIC_CODE = 'CITBBJYS'

PARAMS = undefined

const SCORE = new Score()

async function runExperiment() {
  // stimuli = await $.getJSON(`static/json/${CONDITION}.json`)

  // load configuration and set up parameters
  const config = await $.getJSON(`static/json/config/${CONDITION+1}.json`)
  window.config = config
  PARAMS = _.defaults(config.parameters, {
    eye_tracking: false,
    hover_edges: false,
    hover_rewards: false,
    use_n_steps: false,
    vary_transition: true,
    show_points: false,
    forced_hovers: false,
    keep_hover: true,
    show_hovered_reward: false,
    show_predecessors: false,
    show_successor_rewards: false,
    reveal_by: 'hover',
    revealed: false,
    score_limit: undefined,
    time_limit: 600,
    points_per_cent: 1,
    images: [
      "static/images/baby.png",
      "static/images/ball.png",
      "static/images/bicycle.png",
      "static/images/bowtie.png",
      "static/images/couch.png",
      "static/images/crab.png",
      "static/images/cupcake.png",
      "static/images/fence.png",
      "static/images/poolring.png",
      "static/images/toothbrush.png",
      "static/images/zebra.png",
    ]
  })

  console.log('config.parameters', config.parameters)

  PARAMS.graphRenderOptions = {
    onlyShowCurrentEdges: false,
    width: 800,
    height: 600,
    scaleEdgeFactor: 1,
    fixedXY: circleXY(config.trials.main[0].graph.length)
  };
  updateExisting(PARAMS, urlParams)
  psiturk.recordUnstructuredData('PARAMS', PARAMS);

  const trials = _.mapValues(config.trials, block => block.map(t => ({...PARAMS, ...t})))
  if (PARAMS.time_limit) {
    PARAMS.score_limit = undefined
  }
  if (PARAMS.score_limit) {
    PARAMS.points_per_cent = Infinity
  }
  const bonus = new Bonus({points_per_cent: PARAMS.points_per_cent, initial: 0})
  // makeGlobal({config, PARAMS, trials})


  // logEvent is how you save data to the database
  logEvent('experiment.initialize', {condition: CONDITION, params: PARAMS, trials: config.trials})
  enforceScreenSize(1000, 780)
  DISPLAY.css({width: 1000})


  async function instructions() {
    await new GraphInstructions({trials, bonus}).run(DISPLAY)
  }

  async function main(trials, hidden) {
    DISPLAY.empty()
    let top = new TopBar({
      // nTrial: trials.length,
      height: 70,
      width: 800,
    }).prependTo(DISPLAY)

    SCORE.attach(top.div)
    // score.addPoints(50)
    // bonus.addPoints(50)

    // if (local) PARAMS.time_limit = 300

    let timer = new Timer({label: 'Time Left: ', time: PARAMS.time_limit})
    if (PARAMS.time_limit) {
      timer.attach(top.div)
      timer.css({float: 'right'})
      timer.pause()
      timer.run()
    }

    registerEventCallback(info => {
      if (info.event == 'graph.addPoints') {
        SCORE.addPoints(info.points)
        bonus.addPoints(info.points)
      }
      else if (info.event == 'graph.done') {
        timer.pause()
      }
      else if (info.event == 'graph.showGraph') {
        timer.unpause()
        // 2:18 2:24
      }
    })

    function checkDone() {
      if (PARAMS.score_limit && SCORE.score > PARAMS.score_limit) {
        return true
      } else if (PARAMS.time_limit && timer.done) {
        return true
      }
      return false
    }

    let workspace = $('<div>').appendTo(DISPLAY)
    for (let [i, trial] of trials.entries()) {
      if (checkDone()) break
      workspace.empty()

      // let start_message = PARAMS.score_limit ?
      //   `You're ${PARAMS.score_limit - SCORE.score} points away from finishing` :

      start_message = undefined
      show_locations = false
      if (i % 10 == 0) {
        start_message = bonus.reportBonus()
        show_locations = true
      }
      let cg = new CircleGraph({...PARAMS, ...trial, start_message, show_locations})

      await cg.run(workspace)
      timer.pause()

      psiturk.recordUnstructuredData('bonus', bonus.dollars())
      saveData()
    }
  }

  async function mainRevealed() {
    await main(trials.main_revealed)
  }
  async function mainHidden() {
    await main(trials.main_hidden, true)
  }

  async function learnLocations() {
    DISPLAY.empty()

    let prompt = $('<div>')
    .addClass('text instructions')
    .css({
      height: 200,
      marginTop: 20,
      width: 600
      // marginLeft: 200
    })
    .appendTo(DISPLAY)

    let cgDiv = $('<div>').appendTo(DISPLAY)

    async function showPrompt(html) {
      prompt.show(); cgDiv.hide()
      prompt.html(html + '<br><br>')
      await button(prompt, 'continue').promise()
      prompt.hide(); cgDiv.show()
    }

    await showPrompt(`
      <h1> Stage 2</h1>

      Great job! In Stage 1, you earned $${bonus.dollars().toFixed('2')}.
      But don't get too confident—this next stage is going to be tougher!
    `)
    await this.button()

    await showPrompt(`
      <h1> Stage 2</h1>

      Specifically, we're not going to show you the images anymore. You'll have
      to remember where the images are located if you want to keep earning points!
    `)
    await this.button()

    await showPrompt(`
      <h1>Memory Check (1/3)</h1>

      Before you continue, we want to make sure you've learned the location of each image.
      When an image appears, click its location on the board. You can continue to the
      next round when you get every image correct without making any mistakes.
    `)

    logEvent(`experiment.learn.1`)
    let cg = new CircleGraph({...PARAMS, start: 0, mode: 'locationQuiz'})
    await cg.run(cgDiv)

    await showPrompt(`
      <h1>Memory Check (2/3)</h1>
      Well done! Now we're going to make it a bit harder. This time, you have
      to click the correct location within <b>3 seconds</b> of the image appearing.
      If you're too slow, it will count as a mistake.
    `)

    logEvent(`experiment.learn.2`)
    cg = new CircleGraph({...PARAMS, start: 0, mode: 'locationQuiz', timeLimit: 3000})
    await cg.run(cgDiv)

    await showPrompt(`
      <h1>Memory Check (3/3)</h1>
      Great! In this final round, you only have <b>1.5 seconds</b> to make your response.
    `)

    logEvent(`experiment.learn.3`)
    cg = new CircleGraph({...PARAMS, start: 0, mode: 'locationQuiz', timeLimit: 1500})
    await cg.run(cgDiv)

    await showPrompt(`
      <h1>Stage 2</h1>
      Awesome! It looks like you've learned where all the images live.
      You're now ready to begin Stage 2. Good luck!
    `)
  }


  async function motivation() {
    DISPLAY.empty()
    let div = $('<div>').appendTo(DISPLAY).addClass('text')
    $('<p>').appendTo(div).html(markdown(`
      # Quick question
    `))

    let motivation = new Slider({
      prompt: 'How motivated did you feel to score points?',
      leftLabel: 'not at all motivated',
      rightLabel: 'very motivated'
    }).appendTo(div)

    let speedacc = new Slider({
      prompt: 'How do you think you balanced <b>speed</b> (doing many rounds) with <b>accuracy</b> (getting the most points possible on every round)?',
      leftLabel: 'only speed',
      rightLabel: 'only accuracy'
    }).appendTo(div)

    // new RadioButtons({
    //   prompt: 'How motivated did you feel to score points quickly?',
    //   choices: ['hardly', 'a bit', 'fairly', 'very']
    // }).appendTo(div)

    await button(div, 'submit').clicked
    // this information is already in the log, but let's put it in one place
    logEvent('motivation.submitted', getInputValues({motivation, speedacc}))
  }


  async function survey() {
    _.shuffle(CLINICAL_SURVEY.pages.slice(0,-1)).forEach((x, i) => {
      x.elements[0].rows = _.shuffle(x.elements[0].rows)
      CLINICAL_SURVEY.pages[i] = x
    })
    await new SurveyTrial(CLINICAL_SURVEY).run(DISPLAY)
  }

  async function debrief() {
    psiturk.recordUnstructuredData('completed', true)
    DISPLAY.empty()
    let div = $('<div>').appendTo(DISPLAY).addClass('text')
    $('<p>').appendTo(div).html(markdown(`
      # You're done!

      If you have any feedback please provide it below (feel free to leave it empty!)
    `))

    let feedback = text_box(div)

    await button(div, 'submit').clicked
    // this information is already in the log, but let's put it in one place
    logEvent('debrief.submitted', getInputValues({feedback}))
  }

  // using runTimeline is optional, but it allows you to jump to different blocks
  // with url parameters, e.g. http://localhost:8000/?block=main
  await runTimeline(
    instructions,
    mainRevealed,
    learnLocations,
    mainHidden,
    // motivation,
    // survey,
    // debrief
  )
};
