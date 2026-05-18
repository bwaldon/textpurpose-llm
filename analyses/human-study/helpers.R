library(dplyr)
library(tidyr)
library(ggplot2)

condition_levels <- c("violation", "overinclusion", "underinclusion", "compliance")

# Bootstrap proportion CI. x is a character vector of "yes"/"no" responses.
boot_prop_ci <- function(x, n_boot = 2000, alpha = 0.05) {
  x <- as.integer(x == "yes")
  boot_means <- replicate(n_boot, mean(sample(x, length(x), replace = TRUE)))
  tibble(
    prop  = mean(x),
    lower = quantile(boot_means, alpha / 2),
    upper = quantile(boot_means, 1 - alpha / 2)
  )
}

make_long <- function(df) {
  df %>%
    select(participant_id, scenario, condition, prediction_condition,
           q1_individual_judgment, q2_prediction) %>%
    pivot_longer(c(q1_individual_judgment, q2_prediction),
                 names_to = "question", values_to = "response") %>%
    mutate(
      condition            = factor(condition, levels = condition_levels),
      question             = recode(question,
                                    q1_individual_judgment = "Q1: Individual judgment",
                                    q2_prediction          = "Q2: Prediction"),
      prediction_condition = factor(prediction_condition, levels = c("human", "llm"))
    )
}

summarise_overall <- function(long_df) {
  long_df %>%
    group_by(prediction_condition, condition, question) %>%
    group_modify(~ boot_prop_ci(.x$response)) %>%
    ungroup()
}

summarise_by_item <- function(long_df) {
  long_df %>%
    group_by(prediction_condition, scenario, condition, question) %>%
    group_modify(~ boot_prop_ci(.x$response)) %>%
    ungroup()
}

plot_overall <- function(summary_df, title) {
  ggplot(summary_df, aes(x = condition, y = prop, fill = question)) +
    geom_col(position = position_dodge(0.8), width = 0.7) +
    geom_errorbar(aes(ymin = lower, ymax = upper),
                  position = position_dodge(0.8), width = 0.25) +
    facet_wrap(~prediction_condition) +
    scale_y_continuous(limits = c(0, 1), labels = scales::percent_format()) +
    labs(x = "Condition", y = "Proportion 'yes'", fill = NULL, title = title) +
    theme_minimal() +
    theme(legend.position = "bottom")
}

plot_by_item <- function(summary_df, title) {
  ggplot(summary_df, aes(x = condition, y = prop, fill = question)) +
    geom_col(position = position_dodge(0.8), width = 0.7) +
    geom_errorbar(aes(ymin = lower, ymax = upper),
                  position = position_dodge(0.8), width = 0.25) +
    facet_grid(scenario ~ prediction_condition) +
    scale_y_continuous(limits = c(0, 1), labels = scales::percent_format()) +
    labs(x = "Condition", y = "Proportion 'yes'", fill = NULL, title = title) +
    theme_minimal() +
    theme(legend.position = "bottom",
          axis.text.x = element_text(angle = 45, hjust = 1))
}
