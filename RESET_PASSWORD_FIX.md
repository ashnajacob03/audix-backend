# Fix for Reset Password 500 Error

## Problem
The reset password endpoint is returning a 500 Internal Server Error. This is caused by missing environment variables that are required for the backend to function properly.

## Root Cause
The backend is missing a `.env` file with the following required environment variables:
- `JWT_SECRET` - Required for JWT token generation
- `BCRYPT_SALT_ROUNDS` - Required for password hashing
- `MONGODB_URI` - Required for database connection
- Other optional variables for email, rate limiting, etc.

## Solution

### Step 1: Create Environment File
Copy the `env.example` file to `.env` in the backend directory:

```bash
cd audix-backend
cp env.example .env
```

### Step 2: Configure Environment Variables
Edit the `.env` file and set the required values:

```env
# Required - Set these values
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
BCRYPT_SALT_ROUNDS=12
MONGODB_URI=mongodb://localhost:27017/audix

# Optional - Configure as needed
FRONTEND_URL=http://localhost:5173
PORT=3002
NODE_ENV=development
```

### Step 3: Restart the Backend Server
After creating the `.env` file, restart your backend server:

```bash
# If using npm
npm run dev

# If using node directly
node server.js
```

## Testing the Fix

### Option 1: Run the Test Script
Use the provided test script to verify the fix:

```bash
cd audix-backend
node scripts/testResetPassword.js
```

This script will:
- Check if environment variables are set
- Test the password reset flow
- Verify token generation
- Identify any remaining issues

### Option 2: Test via Frontend
1. Navigate to the reset password page
2. Enter a valid reset token and new password
3. Check the backend console for detailed logs
4. Verify the password reset completes successfully

## Debugging

If you still encounter issues, the enhanced logging will show:
- Request details received
- Token processing steps
- User lookup results
- Password update process
- Token generation status

Check the backend console for these log messages to identify where the process fails.

## Common Issues

1. **Missing JWT_SECRET**: Will cause token generation to fail
2. **Invalid MONGODB_URI**: Will cause database connection to fail
3. **Missing BCRYPT_SALT_ROUNDS**: Will cause password hashing to fail
4. **Invalid reset token**: Will cause user lookup to fail

## Security Notes

- Change the `JWT_SECRET` to a strong, unique value in production
- Never commit the `.env` file to version control
- Use environment-specific configuration files for different deployments 