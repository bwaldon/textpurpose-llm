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
      var bonusText;
      if (exp.condition === 'individual-judgment') {
        bonusText = "";
      } else if (exp.condition === 'coordination') {
        bonusText = showBonus
          ? " As a bonus, you will earn an extra <b>$0.50</b> if you and your partner agree on at least 6 out of 8 decisions."
          : "";
      } else {
        bonusText = showBonus
          ? " As a bonus, you will earn an extra <b>$0.50</b> if you answer this question correctly on at least 6 out of 8 trials."
          : "";
      }

      var instructions;
      if (exp.condition === 'llm-consensus') {
        instructions =
          "<p>For each scenario, <em>three AI chatbots</em> will be asked to evaluate whether the person violated the rule &mdash; answering YES or NO. Your task is to predict what answer the <em>majority of those chatbots</em> will give.</p>" +
          "<p>" + bonusText + "</p>" +
          "<p>We will ask three chatbots &mdash; <b>ChatGPT</b> (OpenAI's <i>GPT-4.1</i> model), <b>Claude</b> (Anthropic's <i>Claude Sonnet</i> model), and <b>Gemini</b> (Google's <i>Gemini 2.5 Flash</i> model) and use the majority answer. These models were each released within the last 12 to 18 months.</p>"
      } else if (exp.condition === 'human-consensus') {
        instructions =
          "<p>For each scenario, a <em>separate group</em> of experiment participants will be asked for their <em>personal opinion</em> on whether the person violated the rule &mdash; answering YES or NO. Your task is to predict what answer the <em>majority of that separate group</em> will give.</p>" +
          "<p>" + bonusText + "</p>"
      } else if (exp.condition === 'individual-judgment') {
        instructions =
          "<p>For each scenario, you will be asked to share your <em>personal opinion</em> on whether the person violated the rule &mdash; answering YES or NO.</p>" +
          "<p>" + bonusText + "</p>"
      } else {
        // coordination
        instructions =
          "<p>You have been paired with another participant. For each scenario, both of you will be asked to make a decision on whether the person violated the rule &mdash; answering YES or NO. You must try to reach the <em>same decision as your partner</em> on each case, <em>without communicating with each other</em>.</p>" +
          "<p>" + bonusText + "</p>"
      }
      $("#instructions_main").html(
        "<p>In this study, you will read a series of short scenarios. Each scenario describes a rule that was established for a specific reason, along with a description of what one person did.</p>" +
        instructions + 
        "<p>Please read each scenario carefully before responding.</p>");
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
        questionText = "Based on their personal opinions, what answer will the majority of a separate group of experiment participants give: did <b>" + stim.name + "</b> violate the rule (YES) or not (NO)?";
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
  // Override with ?condition=<name> for manual testing
  var validConditions = ['llm-consensus', 'human-consensus', 'individual-judgment', 'coordination'];
  var conditionParam = urlParams.get('condition');
  if (validConditions.indexOf(conditionParam) !== -1) {
    exp.condition = conditionParam;
  } else {
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
