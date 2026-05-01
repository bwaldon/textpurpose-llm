const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const demoMode = !(urlParams.get('demoMode') == undefined);
const debugMode = urlParams.get('debug') !== null;

function make_slides(f) {
  var slides = {};

  slides.i0 = slide({
    name: "i0",
    start: function() {
      exp.startT = Date.now();
    }
  });

  slides.consent = slide({
    name: "consent",
    button: function() {
      exp.go();
    }
  });

  slides.instructions = slide({
    name: "instructions",
    start: function() {
      if (exp.prediction_condition === 'human') {
        $("#instructions_q2_item").html(
          "<b>Your prediction about others:</b> After giving your own answer, you will be asked: " +
          "what answer will the <em>majority of other experiment participants</em> give to the same question? " +
          "Answer <b>YES</b> or <b>NO</b>. " +
          "As a bonus, you will earn an extra <b>$0.XX</b> if you answer this question correctly on at least 6 out of 8 trials."
        );
      } else {
        $("#instructions_q2_item").html(
          "<b>Your prediction about AI chatbots:</b> After giving your own answer, you will be asked: " +
          "what answer will the <em>majority of AI chatbots</em> give to the same question? " +
          "We will ask three chatbots &mdash; <em>Claude</em>, <em>ChatGPT</em>, and <em>Gemini</em> &mdash; and use the majority answer. " +
          "Answer <b>YES</b> or <b>NO</b>. " +
          "As a bonus, you will earn an extra <b>$0.XX</b> if you answer this question correctly on at least 6 out of 8 trials."
        );
      }
    },
    button: function() {
      exp.go();
    }
  });

  slides.trial = slide({
    name: "trial",
    present: exp.all_stims,

    present_handle: function(stim) {
      this.trial_start = new Date();
      this.stim = stim;

      $("#vignette").html( stim.header + "<p>" + stim.continuation);

      $("#q1_text").html("Make a decision: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?");

      // Show the prediction question text based on condition
      if (exp.prediction_condition === 'human') {
        $("#q2_text").html("What answer will the majority of other experiment participants give to the above question?");
      } else {
        $("#q2_text").html("What answer will the majority of AI chatbots (Claude, ChatGPT, and Gemini) give to the above question?");
      }

      // Reset radio buttons
      $('input[name="q1"]').prop('checked', false);
      $('input[name="q2"]').prop('checked', false);

      // Show q1 section first; hide prediction section
      this.q1_response = null;
      $("#q1_section").show();
      $("#prediction_section").hide();

      $("#error_msg_q1").hide();
      $("#error_msg_q2").hide();

      if (!demoMode) {
        $("#demoView").hide();
      } else {
        $("#demoName").html("<b>Scenario:</b> " + stim.scenario);
        $("#demoCondition").html("<b>Condition:</b> " + stim.condition);
      }
    },

    button_q1_continue: function() {
      var q1 = $('input[name="q1"]:checked').val();

      if (q1 === undefined) {
        $("#error_msg_q1").show();
        return;
      }

      this.q1_response = q1;
      $("#q1_recap").html($("#q1_text").html());
      $("#q1_section").hide();
      $("#prediction_section").show();
    },

    button_continue: function() {
      var prediction = $('input[name="q2"]:checked').val();

      if (prediction === undefined) {
        $("#error_msg_q2").show();
        return;
      }

      $("#error_msg_q2").hide();
      this.log_responses(this.q1_response, prediction);
      _stream.apply(this);
    },

    log_responses: function(q1, prediction) {
      exp.data_trials.push({
        "individual_judgment": q1,
        "prediction": prediction,
        "prediction_condition": exp.prediction_condition,
        "scenario": this.stim.scenario,
        "condition": this.stim.condition,
        "name": this.stim.name,
        "header": this.stim.header,
        "continuation": this.stim.continuation,
        "time_ms": (new Date()) - this.trial_start,
        "slide_number_in_experiment": exp.phase
      });
    }
  });

  slides.subj_info = slide({
    name: "subj_info",
    button_submit: function(e) {
      var raceData = [];
      var chks = document.getElementById("checkboxes").getElementsByTagName("INPUT");
      for (var i = 0; i < chks.length; i++) {
        if (chks[i].checked) raceData.push(chks[i].value);
      }

      exp.subj_data = {
        language: $("#language").val(),
        enjoyment: $("#enjoyment").val(),
        assess: $('input[name="assess"]:checked').val(),
        age: $("#age").val(),
        gender: $("#gender").val(),
        education: $("#education").val(),
        affiliation: $("#affiliation").val(),
        race: raceData.join(", "),
        legaltraining: $("#legaltraining").val(),
        comments: $("#comments").val(),
        problems: $("#problems").val()
      };
      exp.go();
    }
  });

  slides.thanks = slide({
    name: "thanks",
    start: function() {
      exp.data = {
        "trials": exp.data_trials,
        "system": exp.system,
        "subject_information": exp.subj_data,
        "time_in_minutes": (Date.now() - exp.startT) / 60000,
        "tab_switches": exp.tab_switches,
        "cursor_departs": exp.cursor_departs
      };
      collectdata.submit(exp.data);
    }
  });

  return slides;
}


function init() {
  exp.data_trials = [];

  // Integrity tracking
  exp.tab_switches = 0;
  exp.cursor_departs = 0;

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      exp.tab_switches++;
      if (debugMode) $("#debug_tab_switches").text(exp.tab_switches);
    }
  });

  document.addEventListener('mouseleave', function() {
    exp.cursor_departs++;
    if (debugMode) $("#debug_cursor_departs").text(exp.cursor_departs);
  });

  if (debugMode) $("#debug_overlay").show();

  // Between-subjects condition assignment
  exp.prediction_condition = Math.random() < 0.5 ? 'llm' : 'human';

  // Build one trial per scenario with balanced conditions
  // 8 scenarios, 4 conditions => 2 per condition
  var scenarios = _.uniq(_.pluck(stimuli, 'scenario'));
  scenarios = _.shuffle(scenarios);

  // 3 overinclusion, 3 underinclusion, 1 violation, 1 compliance
  var conditionList = _.shuffle(
    [['overinclusion', 3], ['underinclusion', 3], ['violation', 1], ['compliance', 1]]
      .flatMap(function([c, n]) { return Array(n).fill(c); })
  );

  var selected = [];
  for (var i = 0; i < scenarios.length; i++) {
    var scenario = scenarios[i];
    var condition = conditionList[i];
    var matching = _.filter(stimuli, function(s) {
      return s.scenario === scenario && s.condition === condition;
    });
    if (matching.length > 0) {
      selected.push(matching[0]);
    }
  }

  exp.all_stims = demoMode ? stimuli : _.shuffle(selected);

  exp.system = {
    Browser: BrowserDetect.browser,
    OS: BrowserDetect.OS,
    screenH: screen.height,
    screenUH: exp.height,
    screenW: screen.width,
    screenUW: exp.width
  };

  exp.structure = ["i0", "consent", "instructions", "trial", "subj_info", "thanks"];

  exp.slides = make_slides(exp);

  exp.nQs = utils.get_exp_length();

  $('.slide').hide();

  $("#start_button").click(function() {
    exp.go();
  });

  exp.go();
}
