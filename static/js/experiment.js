ERROR_EMAIL = 'fredcallaway@gmail.com'
// this defines 6 conditions (a 2x3 design)
// make sure to update num_conds in config.txt to reflect any changes you make here
const PARAMS = conditionParameters(CONDITION, {
  showSecretStage: [false, true],
  anotherParameter: [1, 2, 3],
})

updateExisting(PARAMS, urlParams) // allow hardcoding e.g. &showSecretStage=true
psiturk.recordUnstructuredData('params', PARAMS);


async function runExperiment() {
  // stimuli = await $.getJSON(`static/json/${CONDITION}.json`)

  // logEvent is how you save data to the database
  logEvent('experiment.initialize', {CONDITION, PARAMS})
  enforceScreenSize(1200, 750)

  new CircleGraph(DISPLAY, {"name":"intro","bonus":{"initial":50,"points":50,"points_per_cent":3},"type":"intro","eye_tracking":false,"hover_edges":false,"hover_rewards":false,"points_per_cent":3,"use_n_steps":false,"vary_transition":true,"show_points":false,"forced_hovers":false,"keep_hover":true,"show_hovered_reward":true,"show_predecessors":false,"show_successor_rewards":false,"reveal_by":"hover","graphRenderOptions":{"onlyShowCurrentEdges":false,"width":600,"height":600,"scaleEdgeFactor":1,"fixedXY":[[0.4999999999999999,0],[0.7703204087277986,0.07937323358440929],[0.9548159976772592,0.2922924934990568],[0.9949107209404664,0.5711574191366424],[0.8778747871771291,0.8274303669726426],[0.6408662784207149,0.9797464868072487],[0.35913372157928536,0.9797464868072487],[0.12212521282287114,0.8274303669726428],[0.005089279059533713,0.5711574191366432],[0.0451840023227405,0.2922924934990575],[0.22967959127220117,0.07937323358440945]]},"graph":[[1,8],[2,9],[3,10],[0,4],[1,5],[2,6],[3,7],[4,8],[5,9],[6,10],[0,7]],"rewards":[0,0,0,0,0,0,0,0,0,0,0],"start":0,"n_steps":-1,"consume":true,"show_steps":false})




  await makePromise()

  async function instructions() {
    await new ExampleInstructions().run(DISPLAY)
  }

  async function main() {
    DISPLAY.empty()
    let trials = [1,2,3]
    let top = new TopBar({
      nTrial: trials.length,
      height: 70,
      width: 900,
      help: `
        Write some help text here.
      `
    }).prependTo(DISPLAY)

    let workspace = $('<div>').appendTo(DISPLAY)

    for (let trial of trials) {
      // you will probably want to define a more interesting task here
      // or in a separate file (make sure to include it in exp.html)
      workspace.empty()
      await button(workspace, 'click me')
      .css({marginTop: 150, marginLeft: -400 + 200 * trial})
      .promise()
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
