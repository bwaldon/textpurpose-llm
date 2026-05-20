const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const demoMode = !(urlParams.get('demoMode') == undefined);
const debugMode = urlParams.get('debug') !== null;
const showBonus = true;

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
      var bonusText = showBonus
        ? " As a bonus, you will earn an extra <b>$0.50</b> if you answer this question correctly on at least 6 out of 8 trials."
        : "";
      if (exp.prediction_condition === 'human') {
        $("#instructions_q2_item").html(
          "<b>Your prediction about others:</b> After giving your own answer, you will be asked: " +
          "what answer will the <em>majority of other experiment participants</em> give to the same question? " +
          "Answer <b>YES</b> or <b>NO</b>." +
          bonusText
        );
      } else {
        $("#instructions_q2_item").html(
          "<b>Your prediction about AI chatbots:</b> After giving your own answer, you will be asked: " +
          "what answer will the <em>majority of AI chatbots</em> give to the same question? " +
          "Answer <b>YES</b> or <b>NO</b>." + bonusText +
          "<br><br> We will ask three chatbots &mdash; <b>ChatGPT</b> (OpenAI's <i>GPT-4.1</i> model), <b>Claude</b> (Anthropic's <i>Claude Sonnet</i> model), and <b>Gemini</b> (Google's <i>Gemini 2.5 Flash</i> model) and use the majority answer. <br><br> These models were each released within the last 12 to 18 months." 
        );
      }
    },
    button: function() {
      exp.tab_switches = 0;
      exp.cursor_departs = 0;
      exp.integrity_active = true;
      exp.go();
    }
  });

  slides.comprehension_check = slide({
    name: "comprehension_check",
    start: function() {
      $("#comp_check_error").hide();
      $("#comp_check_no_selection").hide();
      this.renderOptions();
    },

    renderOptions: function() {
      var correctText = exp.prediction_condition === 'human'
        ? "I will be asked how other people would interpret rules."
        : "I will be asked how AI chatbots would interpret rules.";

      var options = _.shuffle([
        "I will be asked how to punish AI chatbots that violate rules.",
        "I have to remember a number while I decide each case.",
        correctText,
        "I will be asked to rewrite rules to make them more fair."
      ]);

      var html = '';
      _.each(options, function(opt, i) {
        var val = (opt === correctText) ? 'correct' : 'wrong_' + i;
        html += '<p><label><input type="radio" name="comp_check" value="' + val + '"/> ' + opt + '</label></p>';
      });
      $("#comp_check_options").html(html);
    },

    back_to_instructions: function() {
      exp.back();
    },

    submit_check: function() {
      var selected = $('input[name="comp_check"]:checked').val();
      $("#comp_check_error").hide();
      $("#comp_check_no_selection").hide();

      if (selected === undefined) {
        $("#comp_check_no_selection").show();
        return;
      }

      if (selected === 'correct') {
        exp.go();
      } else {
        exp.comp_check_attempts++;
        if (exp.comp_check_attempts >= 2) {
          $(".slide").hide();
          $(".progress").hide();
          $("#failed_check_overlay").show();
        } else {
          $("#comp_check_error").show();
        }
      }
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
        ai_familiarity: $("#ai_familiarity").val(),
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
  exp.comp_check_attempts = 0;

  // Integrity tracking
  exp.tab_switches = 0;
  exp.cursor_departs = 0;
  exp.integrity_active = false;

  var INTEGRITY_WARN_AT = 2;
  var INTEGRITY_BLOCK_AT = 5;

  function checkIntegrity() {
    if (!exp.integrity_active) return;
    var total = exp.tab_switches + exp.cursor_departs;
    if (total >= INTEGRITY_BLOCK_AT) {
      $(".slide").hide();
      $(".progress").hide();
      $("#return_study_overlay").show();
      return;
    }
    if (total >= INTEGRITY_WARN_AT) {
      var remaining = INTEGRITY_BLOCK_AT - total;
      $("#warning_toast").html(
        "<b>Warning:</b> You have left the study window " + total + " times. " +
        "If you do so " + remaining + " more time(s) you will be asked to return the study and will not be paid."
      ).show();
      setTimeout(function() { $("#warning_toast").fadeOut(); }, 6000);
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      exp.tab_switches++;
      if (debugMode) $("#debug_tab_switches").text(exp.tab_switches);
      checkIntegrity();
    }
  });

  document.addEventListener('mouseleave', function() {
    exp.cursor_departs++;
    if (debugMode) $("#debug_cursor_departs").text(exp.cursor_departs);
    checkIntegrity();
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
    var scenario_data = _.find(stimuli, function(s) { return s.scenario === scenario; });
    if (scenario_data && scenario_data[condition]) {
      selected.push({
        scenario: scenario,
        header: scenario_data.header,
        condition: condition,
        continuation: scenario_data[condition].continuation,
        name: scenario_data[condition].name
      });
    }
  }

  var allFlat = [];
  _.each(stimuli, function(s) {
    _.each(['compliance', 'overinclusion', 'underinclusion', 'violation'], function(cond) {
      if (s[cond]) {
        allFlat.push({
          scenario: s.scenario,
          header: s.header,
          condition: cond,
          continuation: s[cond].continuation,
          name: s[cond].name
        });
      }
    });
  });
  exp.all_stims = demoMode ? allFlat : _.shuffle(selected);

  exp.system = {
    Browser: BrowserDetect.browser,
    OS: BrowserDetect.OS,
    screenH: screen.height,
    screenUH: exp.height,
    screenW: screen.width,
    screenUW: exp.width
  };

  exp.structure = ["i0", "consent", "instructions", "comprehension_check", "trial", "subj_info", "thanks"];

  exp.slides = make_slides(exp);

  exp.nQs = utils.get_exp_length();

  $('.slide').hide();

  $("#start_button").click(function() {
    exp.go();
  });

  exp.go();
}
