process.env.NODE_ENV = 'test';
process.env.SERVICE_NAME = 'monitoring-service';
process.env.LOG_LEVEL = 'error';

jest.setTimeout(10000);

afterAll(async () => {
  jest.clearAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
});
