setwd(dirname(rstudioapi::getActiveDocumentContext()$path))

library(dplyr)
library(tidyr)
library(ggplot2)
library(lme4)

source("helpers.R")

# Synthetic data (for testing analysis pipeline and visualizing predictions)

set.seed(42)

n_synth        <- 400
scenarios_pool <- c("vehicles", "sleep", "shoes", "library",
                    "music", "classroom", "environment", "driving")

# 10 trials per participant: 4 over, 4 under, 1 violation, 1 compliance
trial_conditions <- c(rep("overinclusion", 4), rep("underinclusion", 4),
                      "violation", "compliance")

# Q1 = 50% for over/under; Q2 shifts ±10% depending on pred_condition
# Violation: ceiling ~95%; Compliance: floor ~5%
response_probs <- list(
  human = list(
    overinclusion  = c(q1 = 0.50, q2 = 0.60),
    underinclusion = c(q1 = 0.50, q2 = 0.40),
    violation      = c(q1 = 0.95, q2 = 0.95),
    compliance     = c(q1 = 0.05, q2 = 0.05)
  ),
  llm = list(
    overinclusion  = c(q1 = 0.50, q2 = 0.40),
    underinclusion = c(q1 = 0.50, q2 = 0.60),
    violation      = c(q1 = 0.95, q2 = 0.95),
    compliance     = c(q1 = 0.05, q2 = 0.05)
  )
)

pred_cond_vec <- sample(rep(c("human", "llm"), n_synth / 2))  # balanced random assignment

synth_list <- lapply(seq_len(n_synth), function(i) {
  pc    <- pred_cond_vec[i]
  scens <- sample(scenarios_pool, length(trial_conditions), replace = TRUE)
  do.call(rbind, lapply(seq_along(trial_conditions), function(j) {
    cond <- trial_conditions[j]
    p    <- response_probs[[pc]][[cond]]
    data.frame(
      participant_id         = i,
      scenario               = scens[j],
      condition              = cond,
      prediction_condition   = pc,
      q1_individual_judgment = ifelse(rbinom(1, 1, p["q1"]), "yes", "no"),
      q2_prediction          = ifelse(rbinom(1, 1, p["q2"]), "yes", "no"),
      stringsAsFactors       = FALSE
    )
  }))
})

df_synth <- bind_rows(synth_list)

long_synth            <- make_long(df_synth)
summary_synth_overall <- summarise_overall(long_synth)
summary_synth_by_item <- summarise_by_item(long_synth)

print(plot_overall(summary_synth_overall,
                   "Synthetic data: judgments by condition and prediction condition"))
print(plot_by_item(summary_synth_by_item,
                   "Synthetic data: judgments by condition, prediction condition, and item"))

long_synth_reg <- long_synth %>%
  filter(condition %in% c("overinclusion", "underinclusion")) %>%
  mutate(
    textualist_response  = as.integer(
      (condition == "overinclusion" & response == "yes") |
      (condition == "underinclusion" & response == "no")
    ),
    prediction_condition = relevel(factor(prediction_condition), ref = "human"),
    question             = relevel(factor(question),              ref = "Q1: Individual judgment")
  )

fit_synth <- glmer(
  textualist_response ~ prediction_condition * question +
    (1 + question | participant_id) +
    (1 + prediction_condition * question | scenario),
  data   = long_synth_reg,
  family = binomial)

summary(fit_synth)

# Human data 

df <- read.csv("../../results/human-studies/pipeline-pilot/data-transformed.csv",
               stringsAsFactors = FALSE)

long            <- make_long(df)
summary_overall <- summarise_overall(long)
summary_by_item <- summarise_by_item(long)

print(plot_overall(summary_overall,
                   "Judgments by condition and prediction condition"))
print(plot_by_item(summary_by_item,
                   "Judgments by condition, prediction condition, and item"))

long_reg <- long %>%
  filter(condition %in% c("overinclusion", "underinclusion")) %>%
  mutate(
    textualist_response  = as.integer(
      (condition == "overinclusion" & response == "yes") |
      (condition == "underinclusion" & response == "no")
    ),
    prediction_condition = relevel(factor(prediction_condition), ref = "human"),
    question             = relevel(factor(question),              ref = "Q1: Individual judgment")
  )

fit <- glmer(
  textualist_response ~ prediction_condition * question +
    (1 + question | participant_id) +
    (1 + prediction_condition * question | scenario),
  data   = long_reg,
  family = binomial)