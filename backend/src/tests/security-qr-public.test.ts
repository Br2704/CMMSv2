import request from 'supertest';
import { app } from '../app';

describe('public QR API hardening', () => {
    it('requires a QR token for machine-code public resolution', async () => {
        const response = await request(app).get('/api/qr/public/machine/MDU-PV-EXT-01');

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(String(response.body.message || '')).toMatch(/QR token is required/i);
    });
});
