const logger = (req, res, next) => {
  const start = Date.now();
  
  // Get client IP address
  const getClientIP = (req) => {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.ip;
  };

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const ip = getClientIP(req);
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    // Color codes for different status codes
    const getStatusColor = (status) => {
      if (status >= 500) return '\x1b[31m'; // Red
      if (status >= 400) return '\x1b[33m'; // Yellow
      if (status >= 300) return '\x1b[36m'; // Cyan
      if (status >= 200) return '\x1b[32m'; // Green
      return '\x1b[0m'; // Reset
    };

    const resetColor = '\x1b[0m';
    const statusColor = getStatusColor(res.statusCode);
    
    // Format timestamp
    const timestamp = new Date().toISOString();
    
    // Log format: [TIMESTAMP] METHOD PATH STATUS DURATION IP USER_AGENT
    const logMessage = [
      `[${timestamp}]`,
      `${req.method}`,
      `${req.originalUrl}`,
      `${statusColor}${res.statusCode}${resetColor}`,
      `${duration}ms`,
      `IP: ${ip}`,
      process.env.NODE_ENV === 'development' ? `UA: ${userAgent.substring(0, 50)}...` : ''
    ].filter(Boolean).join(' ');

    console.log(logMessage);

    // Log additional details for errors
    if (res.statusCode >= 400) {
      console.error(`Error details: ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
      
      if (req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        // Remove sensitive information from logs
        if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
        if (sanitizedBody.confirmPassword) sanitizedBody.confirmPassword = '[REDACTED]';
        if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '[REDACTED]';
        if (sanitizedBody.newPassword) sanitizedBody.newPassword = '[REDACTED]';
        
        console.error('Request body:', JSON.stringify(sanitizedBody, null, 2));
      }
    }

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = logger;