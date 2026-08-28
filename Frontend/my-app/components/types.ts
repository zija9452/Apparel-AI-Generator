/** Shapes the backend returns. Kept loose on purpose: the plan payload grows
 *  with every automation feature, and the UI only ever reads a few known keys
 *  from it while showing the rest as raw JSON. */

export type ProductionPlanPayload = {
  items?: unknown[];
  [key: string]: unknown;
};

/** POST /jobs/upload */
export type JobResult = {
  job_id: string;
  production_plan?: ProductionPlanPayload;
  [key: string]: unknown;
};

/** GET /jobs/status/{job_id} */
export type JobStatus = {
  message?: string;
  progress?: number;
  is_ready?: boolean;
  cancelled?: boolean;

  // Pre-flight pauses, one flag per check in illustrator_automation.py
  font_missing?: boolean;
  missing_fonts?: string[];
  center_layer_missing?: boolean;
  pattern_layer_missing?: boolean;
  local_tag_missing?: boolean;
  side_seam_match_layer_missing?: boolean;
  armhole_match_layer_missing?: boolean;
  hoodie_layer_missing?: boolean;
  hood_center_match_layer_missing?: boolean;
  /** Panel names the order asks for that the pattern file does not contain.
   *  Unlike the flags above this one is not tied to a checkbox - it fires on
   *  any job whose part_name/size resolves to a panel the pattern lacks. */
  pattern_piece_missing?: boolean;
  missing_pattern_pieces?: string[];
  /** Illustrator was already open with unsaved changes. The job closes it
   *  without saving, so it asks first. */
  illustrator_unsaved_work?: boolean;
  unsaved_documents?: string[];

  // End-of-job warnings
  warnings?: string[];
  back_label_warnings?: string[];
  /** Panels that FAILED with Illustrator error 1346458189 ('PARM') and were
   *  still broken after the JSX deleted and rebuilt them three times. Each
   *  entry names the size, the panel and the step that failed. */
  parm_errors?: string[];
};
