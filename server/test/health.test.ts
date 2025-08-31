import http from 'http';

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
  });
}

describe('Health endpoint', () => {
  it('responds with 200', async () => {
    const res = await get('http://localhost:4000/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatch(/ok/i);
  });
});
