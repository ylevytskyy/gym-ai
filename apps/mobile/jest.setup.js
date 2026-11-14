process.env.EXPO_PUBLIC_APP_ENV = 'local';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.EXPO_PUBLIC_ASSISTANT_URL = 'http://127.0.0.1:3101';
// The native billing module does not exist under Jest; tests that care mock it themselves.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { configure: jest.fn(), logIn: jest.fn(async () => ({})), logOut: jest.fn(async () => ({})) },
}));
