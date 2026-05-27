import { createWorkOrderSchema, submitWorkOrderForApprovalSchema } from '../modules/workorders/workorders.validators';

describe('Work order validation', () => {
  it('rejects payload with invalid required fields', () => {
    const parsed = createWorkOrderSchema.safeParse({
      asset_id: 'not-a-uuid',
      category: '',
      problem_description: '',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid downtime date range', () => {
    const parsed = createWorkOrderSchema.safeParse({
      asset_id: '2d0afc98-8c8f-470d-8f6d-f4342d7ad4ca',
      category: 'BREAKDOWN',
      problem_description: 'Line stopped unexpectedly',
      downtime_start_at: '2026-01-01T12:00:00.000Z',
      downtime_end_at: '2026-01-01T10:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => String(issue.path[0]) === 'downtime_end_at')).toBe(true);
    }
  });

  it('accepts submit-for-approval when spare_used is false and no materials are provided', () => {
    const parsed = submitWorkOrderForApprovalSchema.safeParse({
      issue_details: 'Pump seal wear observed',
      work_performed_description: 'Inspected and adjusted alignment',
      corrective_action: 'Realigned coupling and tightened mountings',
      remarks: 'Machine stable after test run',
      spare_used: false,
      materials_used: null,
      spare_consumption: [],
    });

    expect(parsed.success).toBe(true);
  });
});
