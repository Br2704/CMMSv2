export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const DIGIT_PATTERN = /\d/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;
const WHITESPACE_PATTERN = /\s/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 12-128 characters and include uppercase, lowercase, number, and special character.';

export function isStrongPassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }

  if (WHITESPACE_PATTERN.test(password)) {
    return false;
  }

  return (
    LOWERCASE_PATTERN.test(password)
    && UPPERCASE_PATTERN.test(password)
    && DIGIT_PATTERN.test(password)
    && SYMBOL_PATTERN.test(password)
  );
}
