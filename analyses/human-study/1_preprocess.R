library(jsonlite)
library(dplyr)
library(tidyr)

setwd(dirname(rstudioapi::getActiveDocumentContext()$path))

raw_data_dir <- "../../results/human-studies/pipeline-pilot/raw-data"
output_path  <- "../../results/human-studies/pipeline-pilot/data-transformed.csv"

json_files <- list.files(raw_data_dir, pattern = "\\.json$", full.names = TRUE)

rows <- lapply(seq_along(json_files), function(i) {
  path <- json_files[[i]]
  d    <- fromJSON(path, simplifyVector = FALSE)

  # Anonymous participant ID (sequential integer, not the filename/Prolific ID)
  participant_id <- i

  # Participant-level metadata
  sys  <- d$system
  subj <- d$subject_information

  trial_rows <- lapply(d$trials, function(t) {
    data.frame(
      participant_id          = participant_id,
      # Trial-level fields
      scenario                = t$scenario,
      condition               = t$condition,
      prediction_condition    = t$prediction_condition,
      name                    = t$name,
      header                  = t$header,
      continuation            = t$continuation,
      slide_number            = t$slide_number_in_experiment,
      trial_time_ms           = t$time_ms,
      # The two question responses
      q1_individual_judgment  = t$individual_judgment,
      q2_prediction           = t$prediction,
      # System metadata
      browser                 = sys$Browser,
      os                      = sys$OS,
      screen_height           = sys$screenH,
      screen_width            = sys$screenW,
      # Session metadata
      time_in_minutes         = d$time_in_minutes,
      tab_switches            = d$tab_switches,
      cursor_departs          = d$cursor_departs,
      # End survey / subject information
      survey_language         = subj$language,
      survey_enjoyment        = subj$enjoyment,
      survey_assess           = subj$assess,
      survey_age              = subj$age,
      survey_gender           = subj$gender,
      survey_education        = subj$education,
      survey_affiliation      = subj$affiliation,
      survey_race             = subj$race,
      survey_legaltraining    = subj$legaltraining,
      survey_comments         = subj$comments,
      survey_problems         = subj$problems,
      stringsAsFactors        = FALSE
    )
  })

  do.call(rbind, trial_rows)
})

df <- do.call(rbind, rows)

write.csv(df, output_path, row.names = FALSE)
message("Saved ", nrow(df), " rows to ", output_path)
