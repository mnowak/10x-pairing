-- Adds the "purple" special estimate marker: a matchup deliberately judged
-- too unpredictable to call, distinct from an unestimated (no-row) cell,
-- which means only "not yet assessed." score becomes nullable; is_purple
-- tracks the special marker; exactly one of the two must be set per row.
-- See context/changes/prepare-opponent-matrix/plan.md for design rationale.

alter table public.pairing_matrix_estimates
  drop constraint pairing_matrix_estimates_score_check;

alter table public.pairing_matrix_estimates
  alter column score drop not null;

alter table public.pairing_matrix_estimates
  add column is_purple boolean not null default false;

alter table public.pairing_matrix_estimates
  add constraint pairing_matrix_estimates_score_range_check
    check (score is null or (score >= 0 and score <= 20));

alter table public.pairing_matrix_estimates
  add constraint pairing_matrix_estimates_score_purple_xor_check
    check (
      (is_purple and score is null) or
      (not is_purple and score is not null)
    );
