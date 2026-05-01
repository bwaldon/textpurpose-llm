function get_url_param(name, defaultValue) {
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(window.location.href);
  if (results == null) {
    return defaultValue;
  } else {
    return results[1];
  }
}

function htmlify(obj) {
  if (obj instanceof Array) {
    return "[" + obj.map(function(o) { return htmlify(o); }).join(",") + "]";
  } else if (typeof obj == "object") {
    var strs = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        strs.push("<li>" + htmlify(key) + ": " + htmlify(obj[key]) + "</li>");
      }
    }
    return "{<ul>" + strs.join("") + "</ul>}";
  } else if (typeof obj == "string") {
    return '"' + obj + '"';
  } else if (typeof obj == "undefined") {
    return "[undefined]";
  } else {
    return obj.toString();
  }
}

var collectdata = {
  submit: function(expdata) {
    var experiment_id = get_url_param("experiment_id", null);
    var participant_id = get_url_param("participant_id", null);

    // debug mode: display data in browser when URL params are absent
    if (!experiment_id || !participant_id) {
      var div = $("<div></div>");
      div.css({
        "font-family": '"HelveticaNeue-Light", "Helvetica Neue Light", "Helvetica Neue", sans-serif',
        "font-size": "14px",
        "float": "right",
        "padding": "1em",
        "background": "#dfdfdf"
      });
      div.html("<p><b>Debug mode</b></p>Here is the data that would have been submitted: <ul>" + htmlify(expdata) + "</ul>");
      $("body").append(div);
      return;
    }

    if ($("#thanks").length > 0 && $("#uploading-text").length == 0) {
      $("#thanks").html(
        '<p class="big" id="uploading-text">Uploading data... Please don\'t close this window!</p>' +
        '<p class="big" id="thanks-text">Thanks for your time!</p>'
      );
    }
    $("#uploading-text").show();
    $("#thanks-text").hide();

    $.post("https://bwaldon.net/savedata.php", {
      "data": JSON.stringify(expdata),
      "experiment_id": experiment_id,
      "participant_id": participant_id
    }).done(function() {
      $("#uploading-text").hide();
      $("#thanks-text").show();
    }).fail(function() {
      if ($("#thanks").length > 0) {
        $("#thanks").html(
          "<p><strong>Oooops, an error occurred!</strong></p>" +
          "<p>Please message the researcher to get compensated. " +
          "We apologize for any inconvenience caused.</p>"
        );
      }
    });
  }
};

// backwards compatibility
var turk = {
  previewMode: false,
  submit: collectdata.submit
};
