const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const demoMode = !(urlParams.get('demoMode') == undefined);

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

      $("#q1_text").html("1. Make a decision: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?");

      // Show the prediction question text based on condition
      if (exp.prediction_condition === 'human') {
        $("#q2_text").html("2. What answer will the majority of other experiment participants give to Question 1?");
      } else {
        $("#q2_text").html("2. What answer will the AI chatbot give to Question 1?");
      }

      // Reset radio buttons
      $('input[name="q1"]').prop('checked', false);
      $('input[name="q2"]').prop('checked', false);

      $("#error_msg").hide();

      if (!demoMode) {
        $("#demoView").hide();
      } else {
        $("#demoName").html("<b>Scenario:</b> " + stim.scenario);
        $("#demoCondition").html("<b>Condition:</b> " + stim.condition);
      }
    },

    button_continue: function() {
      var q1 = $('input[name="q1"]:checked').val();
      var prediction = $('input[name="q2"]:checked').val();

      if (q1 === undefined || prediction === undefined) {
        $("#error_msg").show();
        return;
      }

      $("#error_msg").hide();
      this.log_responses(q1, prediction);
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
        "time_in_minutes": (Date.now() - exp.startT) / 60000
      };
      turk.submit(exp.data);
    }
  });

  return slides;
}


function init() {
  exp.data_trials = [];

  // Between-subjects condition assignment
  exp.prediction_condition = Math.random() < 0.5 ? 'llm' : 'human';

  // Build one trial per scenario with balanced conditions
  // 8 scenarios, 4 conditions => 2 per condition
  var scenarios = _.uniq(_.pluck(stimuli, 'scenario'));
  scenarios = _.shuffle(scenarios);

  var conditions = ['violation', 'compliance', 'overinclusion', 'underinclusion'];
  // Repeat conditions to cover all 8 scenarios (2 of each)
  var conditionList = _.shuffle(conditions.concat(conditions));

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
    if (turk.previewMode) {
      $("#mustaccept").show();
    } else {
      $("#start_button").click(function() { $("#mustaccept").show(); });
      exp.go();
    }
  });

  exp.go();
}
