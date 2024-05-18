ERROR_EMAIL = 'fredcallaway@gmail.com'
PROLIFIC_CODE = 'CITBBJYS'

PARAMS = undefined

async function runExperiment() {
  // stimuli = await $.getJSON(`static/json/${CONDITION}.json`)

  // load configuration and set up parameters
  const config = await $.getJSON(`static/json/config/${CONDITION}.json`)
  window.config = config
  PARAMS = _.defaults(config.parameters, {
    two_stage: true,
    use_process_tracing: false,
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
    n_block_hidden: 2,
    n_block_revealed: 2,
    block_duration: 5,
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
    fixedXY: circleXY(config.trials.main_revealed[0].graph.length)
  };
  updateExisting(PARAMS, urlParams)
  psiturk.recordUnstructuredData('PARAMS', PARAMS);

  // logEvent is how you save data to the database
  logEvent('experiment.initialize', {condition: CONDITION, params: PARAMS, trials: config.trials})
  enforceScreenSize(1000, 780)
  DISPLAY.css({width: 1000})

  // add PARAMS to all trials, create iterator
  const trials = _.mapValues(config.trials, block => block.map(t => ({...PARAMS, ...t})))
  let trialIdx = -1
  function nextTrial() {
    trialIdx += 1
    return trials.main_revealed[trialIdx]
  }

  // score and bonus
  const SCORE = new Score()
  const BONUS = new Bonus({points_per_cent: PARAMS.points_per_cent, initial: 0})


  // DEFINE BLOCKS

  async function instructions() {
    await new GraphInstructions({trials, bonus: BONUS}).run(DISPLAY)
  }

  async function mainBlock(name, hidden) {
    DISPLAY.empty()
    let top = new TopBar({
      // nTrial: trials.length,
      height: 70,
      width: 800,
    }).prependTo(DISPLAY)

    SCORE.attach(top.div)

    let timer = new Timer({label: 'Time Left: ', time: 60 * PARAMS.block_duration})
    let cb = registerEventCallback(info => {
      if (info.event == 'graph.done') {
        timer.pause()
      }
      else if (info.event == 'graph.describe') {
        timer.unpause()
      }
    })
    timer.attach(top.div)
    timer.css({float: 'right'})
    timer.run()
    timer.pause()

    let workspace = $('<div>').appendTo(DISPLAY)
    while (!timer.done) {
      let trial = nextTrial()
      let cg = new CircleGraph({...trial, hover_edges: PARAMS.use_process_tracing, hide_states: hidden})

      await cg.run(workspace)
      workspace.empty()
      psiturk.recordUnstructuredData('BONUS', BONUS.dollars())
      saveData()
    }
    removeEventCallback(cb)

    await new Prompt().attach(DISPLAY).showMessage(`
      <h1>Block ${name} complete</h1>

      ${BONUS.reportBonus()}. Feel free to take a quick break, then click continue
      when you're ready to move on.
    `)
  }

  async function mainRevealed() {
    // start tracking points
    registerEventCallback(info => {
      if (info.event == 'graph.addPoints') {
        SCORE.addPoints(info.points)
        BONUS.addPoints(info.points)
      }
    })

    for (i of _.range(PARAMS.n_block_revealed)) {
      await mainBlock(`${i+1}/${PARAMS.n_block_revealed}`, false)
    }
  }
  async function mainHidden() {
    for (i of _.range(PARAMS.n_block_hidden)) {
      await mainBlock(`${i+1}/${PARAMS.n_block_hidden}`, false)
    }
  }

  async function learnLocations() {
    DISPLAY.empty()

    let prompt = new Prompt().attach(DISPLAY)
    let cgDiv = $('<div>').appendTo(DISPLAY)

    async function showPrompt(html) {
      cgDiv.hide()
      await prompt.showMessage(html)
      cgDiv.show()
    }

    await showPrompt(`
      <h1> Stage 2</h1>

      Great job! In Stage 1, you earned $${BONUS.dollars().toFixed('2')}.
      But don't get too confident—this next stage is going to be tougher!
    `)

    await showPrompt(`
      <h1> Stage 2</h1>

      Specifically, we're not going to show you the images anymore. You'll have
      to remember where the images are located if you want to keep earning points!
    `)

    await showPrompt(`
      <h1>Memory Check (1/3)</h1>
      Before you continue, we want to make sure you've learned the location of each image.
      When an image appears, click its location on the board. You can continue to the
      next round when you get every image correct without making any mistakes.
    `)
    logEvent(`experiment.learn.1A`)
    await new CircleGraph({...PARAMS, mode: 'quizImage'}).run(cgDiv)

    await showPrompt(`
      <h1>Memory Check (1/3)</h1>
      Great! Now let's try the reverse. We'll highlight a location, and you'll
      click on the image that lives there.
    `)
    logEvent(`experiment.learn.1B`)
    await new CircleGraph({...PARAMS, mode: 'quizLocation'}).run(cgDiv)


    await showPrompt(`
      <h1>Memory Check (2/3)</h1>
      Well done! Now we're going to make it a bit harder. This time, you have
      to click the correct location within <b>3 seconds</b> of the image appearing.
      If you're too slow, it will count as a mistake.
    `)
    logEvent(`experiment.learn.2A`)
    await new CircleGraph({...PARAMS, mode: 'quizImage', timeLimit: 3000}).run(cgDiv)

    await showPrompt(`
      <h1>Memory Check (2/3)</h1>
      Great! Let's try the reverse version with the time limit.
    `)
    logEvent(`experiment.learn.2B`)
    await new CircleGraph({...PARAMS, mode: 'quizLocation', timeLimit: 3000}).run(cgDiv)


    await showPrompt(`
      <h1>Memory Check (3/3)</h1>
      Alright! In this final round, you only have <b>2 seconds</b> to make your response.
    `)

    logEvent(`experiment.learn.3A`)
    await new CircleGraph({...PARAMS, mode: 'quizImage', timeLimit: 2000}).run(cgDiv)

    await showPrompt(`
      <h1>Memory Check (3/3)</h1>
      And the reverse...
    `)

    logEvent(`experiment.learn.3A`)
    await new CircleGraph({...PARAMS, mode: 'quizLocation', timeLimit: 2000}).run(cgDiv)

    await showPrompt(`
      <h1>Stage 2</h1>
      Awesome! It looks like you've learned where all the images live.
      You're now ready to begin Stage 2. Good luck!
    `)
  }

  async function debrief() {
    psiturk.recordUnstructuredData('completed', true)
    DISPLAY.empty()
    let div = $('<div>').appendTo(DISPLAY).addClass('text')
    $('<p>').appendTo(div).html(markdown(`
      # You're done!

      If you have any feedback please provide it below (feel free to leave it empty!)

      <b>We are testing out a new experiment so feedback is really useful for us!</b>
    `))

    let feedback = text_box(div)

    await button(div, 'submit').promise()
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
    // survey,
    debrief
  )
};
