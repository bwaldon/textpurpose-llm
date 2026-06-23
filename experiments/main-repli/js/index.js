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

      if (exp.condition === 'llm-consensus') {
        $("#instructions_main").html(
          "<p>In this study, you will read a series of short scenarios. Each scenario describes a rule that was established for a specific reason, along with a description of what one person did.</p>" +
          "<p>For each scenario, you will answer <b>one question</b>:</p>" +
          "<ul><li><b>Your prediction about AI chatbots:</b> What answer will the <em>majority of AI chatbots</em> give to the question of whether the person violated the rule? Answer <b>YES</b> or <b>NO</b>." + bonusText + "</li></ul>" +
          "<p>We will ask three chatbots &mdash; <b>ChatGPT</b> (OpenAI's <i>GPT-4.1</i> model), <b>Claude</b> (Anthropic's <i>Claude Sonnet</i> model), and <b>Gemini</b> (Google's <i>Gemini 2.5 Flash</i> model) and use the majority answer. These models were each released within the last 12 to 18 months.</p>" +
          "<p>Please read each scenario carefully before responding.</p>"
        );
      } else if (exp.condition === 'human-consensus') {
        $("#instructions_main").html(
          "<p>In this study, you will read a series of short scenarios. Each scenario describes a rule that was established for a specific reason, along with a description of what one person did.</p>" +
          "<p>For each scenario, you will answer <b>one question</b>:</p>" +
          "<ul><li><b>Your prediction about others:</b> What answer will the <em>majority of other experiment participants</em> give to the question of whether the person violated the rule? Answer <b>YES</b> or <b>NO</b>." + bonusText + "</li></ul>" +
          "<p>Please read each scenario carefully before responding.</p>"
        );
      } else if (exp.condition === 'individual-judgment') {
        $("#instructions_main").html("Instructions go here");
      } else {
        // coordination
        $("#instructions_main").html("Instructions go here");
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
      var correctText;
      if (exp.condition === 'llm-consensus') {
        correctText = "I will be asked how AI chatbots would interpret rules.";
      } else if (exp.condition === 'human-consensus') {
        correctText = "I will be asked how other people would interpret rules.";
      } else if (exp.condition === 'individual-judgment') {
        correctText = "I will be asked about my own interpretation of rules.";
      } else {
        // coordination
        correctText = "I have to interpret rules in the same way as a second player.";
      }

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

      $("#vignette").html(stim.header + "<p>" + stim.continuation);

      var questionText, bonusNote;
      if (exp.condition === 'llm-consensus') {
        questionText = "What answer will the majority of AI chatbots (Claude, ChatGPT, and Gemini) give: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?";
        bonusNote = "Your guesses about AI chatbots' responses determine your bonus payment.";
      } else if (exp.condition === 'human-consensus') {
        questionText = "What answer will the majority of other experiment participants give: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?";
        bonusNote = "Your guesses about other participants' responses determine your bonus payment.";
      } else if (exp.condition === 'individual-judgment') {
        questionText = "Make a decision: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?";
        bonusNote = "Answer based on your own opinion.";
      } else {
        // coordination
        questionText = "Make a decision: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?";
        bonusNote = "Your bonus payment is determined by whether your answers match those of your partner.";
      }

      $("#question_text").html(questionText);
      $("#question_bonus_note").html(bonusNote);

      $('input[name="q1"]').prop('checked', false);
      $("#error_msg").hide();

      if (!demoMode) {
        $("#demoView").hide();
      } else {
        $("#demoName").html("<b>Scenario:</b> " + stim.scenario);
        $("#demoCondition").html("<b>Condition:</b> " + stim.condition);
      }
    },

    button_continue: function() {
      var response = $('input[name="q1"]:checked').val();

      if (response === undefined) {
        $("#error_msg").show();
        return;
      }

      $("#error_msg").hide();
      this.log_responses(response);
      _stream.apply(this);
    },

    log_responses: function(response) {
      exp.data_trials.push({
        "response": response,
        "condition": exp.condition,
        "scenario": this.stim.scenario,
        "vignette_condition": this.stim.condition,
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
    start: function() {
      exp.integrity_active = false;
    },
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

  // Between-subjects condition assignment (4 equal groups)
  var condRand = Math.random();
  if (condRand < 0.25) {
    exp.condition = 'llm-consensus';
  } else if (condRand < 0.5) {
    exp.condition = 'human-consensus';
  } else if (condRand < 0.75) {
    exp.condition = 'individual-judgment';
  } else {
    exp.condition = 'coordination';
  }

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
