import { listQuerySchema, parseListQuery } from '../utils/pagination';

describe('List query validation', () => {
  it('coerces page and limit from query-string values', () => {
    const parsed = listQuerySchema.parse({ page: '2', limit: '50' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
  });

  it('clamps page and limit to safe bounds', () => {
    const parsed = parseListQuery({ page: '-10', limit: '5000' });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(1000);
  });

  it('defaults to valid values for non-numeric inputs', () => {
    const parsed = parseListQuery({ page: 'abc', limit: 'xyz' });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(100);
  });
});
