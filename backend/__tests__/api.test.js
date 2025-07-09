const request = require('supertest');
const { createTestApp } = require('./testHelper');
const { queryJson } = require('../controllers/queryController');

let app;
let server;

// Mock axios to prevent actual API calls during testing
jest.mock('axios');

// Set up environment variables for testing
process.env.APP_API_KEY = 'test-api-key';


beforeAll(() => {
  app = createTestApp();
  // Start server on a random available port
  return new Promise((resolve) => {
    server = app.listen(0, 'localhost', () => {
      process.env.TEST_SERVER_PORT = server.address().port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

describe('POST /api/query', () => {
  // Reset axios mock between tests
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 and process query successfully', async () => {
    // Mock the axios response
    const mockResponse = {
      data: {
        choices: [{
          message: {
            content: 'Mocked response from Mistral AI'
          }
        }]
      }
    };
    
    // Mock the axios post method
    const axios = require('axios');
    axios.post.mockResolvedValue(mockResponse);

    const testData = {
      json: { test: 'data' },
      query: 'test query'
    };

    const response = await request(app)
      .post('/api/query')
      .set('x-api-key', 'test-api-key')
      .send(testData);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('data');
  });

  it('should return 400 for invalid request body', async () => {
    const response = await request(app)
      .post('/api/query')
      .set('x-api-key', 'test-api-key')
      .send({}); // Missing required fields

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  });

  it('should return 403 for missing API key', async () => {
    const response = await request(app)
      .post('/api/query')
      .send({
        json: { test: 'data' },
        query: 'test query'
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toBe('Forbidden: Invalid API key');
  });
});
