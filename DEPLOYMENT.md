# Backend Deployment Guide

## Quick Fix for "Unable to connect to our servers" Error

Your frontend is trying to connect to `http://localhost:3002/api` (your local backend), but when deployed on Netlify, it can't reach your local machine.

## Solution: Deploy Your Backend

### Option 1: Railway (Recommended - Free & Easy)

1. **Go to [Railway.app](https://railway.app)** and sign up with GitHub
2. **Connect your repository** and select the `audix-backend` folder
3. **Add environment variables** in Railway dashboard:
   - `MONGODB_URI` - Your MongoDB connection string
   - `JWT_SECRET` - Your JWT secret key
   - `NODE_ENV` - Set to `production`
4. **Deploy** - Railway will automatically build and deploy your backend
5. **Get your backend URL** - Railway will give you a URL like `https://your-app-name.railway.app`

### Option 2: Render (Alternative)

1. **Go to [Render.com](https://render.com)** and sign up
2. **Create a new Web Service** from your GitHub repo
3. **Configure**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`
4. **Add environment variables** (same as Railway)
5. **Deploy**

### Option 3: Heroku (Paid)

1. **Install Heroku CLI**
2. **Create Heroku app**: `heroku create your-app-name`
3. **Set environment variables**: `heroku config:set MONGODB_URI=your_uri`
4. **Deploy**: `git push heroku main`

## After Backend Deployment

1. **Update your frontend environment**:
   - Go to your Netlify dashboard
   - Add environment variable: `VITE_API_BASE_URL=https://your-backend-url.railway.app/api`
   - Add environment variable: `VITE_SOCKET_URL=https://your-backend-url.railway.app`

2. **Redeploy your frontend** on Netlify

3. **Test** - Your login should now work!

## Environment Variables Needed

Make sure your backend has these environment variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Set to `production`
- `PORT` - Railway/Render will set this automatically
