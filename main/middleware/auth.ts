import { Request, Response, NextFunction } from 'express';

const CLOUD_API_KEY = process.env.CLOUD_API_KEY || 'enterprise-secret-key-123';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // Allow health check and open endpoints
  if (req.path === '/api/health') return next();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== CLOUD_API_KEY) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  next();
}
