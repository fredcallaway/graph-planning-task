ERROR_EMAIL = 'fredcallaway@gmail.com'



async function runExperiment() {
  // stimuli = await $.getJSON(`static/json/${CONDITION}.json`)

  // load configuration and set up parameters
  const config = await $.getJSON(`static/json/config/${CONDITION+1}.json`)
  const params = _.merge({
    eye_tracking: false,
    hover_edges: true,
    hover_rewards: true,
    points_per_cent: 2,
    use_n_steps: false,
    vary_transition: true,
    show_points: false,
    forced_hovers: false,
    keep_hover: true,
    show_hovered_reward: true,
    show_predecessors: false,
    show_successor_rewards: false,
    reveal_by: 'hover'
  }, config.parameters)
  params.graphRenderOptions = {
    onlyShowCurrentEdges: false,
    width: 600,
    height: 600,
    scaleEdgeFactor: 1,
    fixedXY: circleXY(config.trials.main[0].graph.length)
  };
  updateExisting(params, urlParams)
  psiturk.recordUnstructuredData('params', params);
  const trials = _.mapValues(config.trials, block => block.map(t => ({...params, ...t})))
  // makeGlobal({config, params, trials})


  // logEvent is how you save data to the database
  logEvent('experiment.initialize', {CONDITION, config})
  enforceScreenSize(1000, 750)
  DISPLAY.css({width: 1000})


  async function instructions() {
    await new GraphInstructions({trials}).run(DISPLAY)
  }

  async function main() {
    DISPLAY.empty()
    let top = new TopBar({
      nTrial: trials.length,
      height: 70,
      width: 800,
      help: `
        Write some help text here.
      `
    }).prependTo(DISPLAY)

    let workspace = $('<div>').appendTo(DISPLAY)

    for (let trial of trials.main) {
      workspace.empty()
      // you will probably want to define a more interesting task here
      // or in a separate file (make sure to include it in exp.html)
      let cg = new CircleGraph({...params, ...trial})
      await cg.run(workspace)

      top.incrementCounter()
      saveData()

    }
  }

  async function debrief() {
    DISPLAY.empty()
    let div = $('<div>').appendTo(DISPLAY).addClass('text')
    $('<p>').appendTo(div).html(markdown(`
      # You're done!

      Thanks for participating! We have a few quick questions before you go.
    `))

    let difficulty = radio_buttons(div, `
      How difficult was the experiment?
    `, ['too easy', 'just right', 'too hard'])

    let feedback = text_box(div, `
      Do you have any other feedback? (optional)
    `)

    makeGlobal({difficulty})

    await button(div, 'submit').clicked
    // this information is already in the log, but let's put it in one place
    logEvent('debrief.submitted', getInputValues({difficulty, feedback}))
  }

  // using runTimeline is optional, but it allows you to jump to different blocks
  // with url parameters, e.g. http://localhost:8000/?block=main
  await runTimeline(
    instructions,
    main,
    debrief
  )
};
