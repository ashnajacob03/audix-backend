const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class BackgroundExtractionService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.outputDir = path.join(__dirname, '../public/extracted');
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log('Created temp directory:', this.tempDir);
      }
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        console.log('Created output directory:', this.outputDir);
      }
    } catch (error) {
      console.error('Error creating directories:', error);
      throw error;
    }
  }

  /**
   * Extract background music (instrumental) from a song
   * @param {string} songId - The song ID
   * @param {string} audioUrl - The audio URL to process
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} - Result with success status and file path
   */
  async extractBackground(songId, audioUrl, progressCallback = null) {
    // Determine file extension from URL or default to .mp3
    const urlExtension = path.extname(new URL(audioUrl).pathname).toLowerCase();
    const inputExtension = urlExtension || '.mp3';
    const tempInputPath = path.join(this.tempDir, `${songId}_input${inputExtension}`);
    const preprocessedWavPath = path.join(this.tempDir, `${songId}_preprocessed.wav`);
    const outputPath = path.join(this.outputDir, `${songId}_background.mp3`);
    
    // Check if this is a preview URL (typically shorter duration)
    const isPreview = audioUrl.includes('preview') || audioUrl.includes('30s') || audioUrl.includes('spotify');
    
    try {
      console.log('Starting background extraction for song:', songId);
      console.log('Audio URL:', audioUrl);
      console.log('Audio type:', isPreview ? 'preview' : 'full');
      console.log('Temp path:', tempInputPath);
      console.log('Output path:', outputPath);
      
      // Ensure directories exist
      this.ensureDirectories();
      
      // Download the audio file (with retries)
      if (progressCallback) progressCallback(10, 'Downloading audio file...');
      await this.downloadAudioWithRetries(audioUrl, tempInputPath, 3);

      // Preprocess: transcode any format to 44.1kHz stereo WAV, up to 30 minutes
      if (progressCallback) progressCallback(20, 'Preprocessing audio...');
      await this.transcodeToStandardWav(tempInputPath, preprocessedWavPath);
      
      // Extract background using center-cancel vocal removal
      if (progressCallback) progressCallback(35, 'Processing audio for background extraction...');
      await this.processAudioForBackground(preprocessedWavPath, outputPath, progressCallback);
      
      // Clean up temp file
      try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch(_) {}
      try { if (fs.existsSync(preprocessedWavPath)) fs.unlinkSync(preprocessedWavPath); } catch(_) {}
      
      if (progressCallback) progressCallback(100, 'Background extraction completed!');
      
      return {
        success: true,
        outputPath: outputPath,
        publicUrl: `/extracted/${songId}_background.mp3`,
        message: `Background music extracted successfully from ${isPreview ? 'preview audio' : 'full audio'}`
      };
      
    } catch (error) {
      console.error('Background extraction error:', error);
      console.error('Error stack:', error.stack);
      
      // Clean up temp files on error
      try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch(_) {}
      try { if (fs.existsSync(preprocessedWavPath)) fs.unlinkSync(preprocessedWavPath); } catch(_) {}
      
      return {
        success: false,
        error: error.message,
        message: 'Failed to extract background music'
      };
    }
  }

  /**
   * Download audio file from URL
   */
  async downloadAudio(url, outputPath) {
    try {
      console.log('Downloading audio from:', url);
      
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Audix/1.0'
        },
        timeout: 30000 // 30 second timeout
      });

      return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        
        writer.on('finish', () => {
          console.log('Audio download completed:', outputPath);
          resolve();
        });
        writer.on('error', (error) => {
          console.error('Error writing audio file:', error);
          reject(error);
        });
        
        response.data.on('error', (error) => {
          console.error('Error downloading audio:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error downloading audio:', error);
      throw new Error(`Failed to download audio: ${error.message}`);
    }
  }

  /**
   * Download with simple retry logic
   */
  async downloadAudioWithRetries(url, outputPath, maxAttempts = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Downloading attempt ${attempt}/${maxAttempts}`);
        await this.downloadAudio(url, outputPath);
        return;
      } catch (err) {
        lastErr = err;
        console.error(`Download attempt ${attempt} failed:`, err.message);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
    throw lastErr || new Error('Failed to download audio after retries');
  }

  /**
   * Transcode any input to 44.1kHz stereo WAV, limited to 30 minutes
   */
  async transcodeToStandardWav(inputPath, wavPath) {
    return new Promise((resolve, reject) => {
      const MAX_DURATION_SECONDS = 30 * 60; // 30 minutes
      ffmpeg(inputPath)
        .audioChannels(2)
        .audioFrequency(44100)
        .format('wav')
        .outputOptions([
          '-ac', '2',
          '-ar', '44100',
          '-t', String(MAX_DURATION_SECONDS)
        ])
        .on('start', (cmd) => console.log('Preprocess ffmpeg:', cmd))
        .on('end', resolve)
        .on('error', reject)
        .save(wavPath);
    });
  }

  /**
   * Process audio to extract background using multiple techniques
   */
  async processAudioForBackground(inputPath, outputPath, progressCallback) {
    return new Promise((resolve, reject) => {
      let currentProgress = 30;
      
      console.log('Processing audio file:', inputPath);
      console.log('Output file:', outputPath);
      
      // Safer center-cancel approach on standardized stereo WAV
      const command = ffmpeg(inputPath)
        .audioChannels(2)
        .audioFrequency(44100)
        .audioBitrate('192k')
        .complexFilter([
          // Ensure stereo and create inverted-phase mix to attenuate vocals
          '[0:a]asplit[orig][proc];',
          '[proc]pan=stereo|c0=1*c0|c1=-1*c1[inv];',
          '[orig][inv]amix=inputs=2:weights=1 1:duration=first,volume=1.0[out]'
        ])
        .outputOptions([
          '-map', '[out]',
          '-ac', '2',
          '-ar', '44100',
          '-b:a', '192k',
          '-f', 'mp3'
        ])
        .on('start', (commandLine) => {
          console.log('FFmpeg process started:', commandLine);
        })
        .on('progress', (progress) => {
          if (progressCallback) {
            currentProgress = Math.min(90, 35 + (progress.percent || 0) * 0.55);
            progressCallback(currentProgress, 'Extracting background music...');
          }
        })
        .on('end', () => {
          console.log('Background extraction completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          console.error('FFmpeg error message:', err.message);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Alternative method using AI-based vocal removal (requires additional setup)
   * This is a placeholder for future implementation with AI models
   */
  async extractBackgroundWithAI(inputPath, outputPath, progressCallback) {
    // This would integrate with AI models like Spleeter, LALAL.AI API, or similar
    // For now, we'll use the traditional method
    throw new Error('AI-based extraction not implemented yet');
  }

  /**
   * Get extraction status for a song
   */
  getExtractionStatus(songId) {
    const outputPath = path.join(this.outputDir, `${songId}_background.mp3`);
    const exists = fs.existsSync(outputPath);
    
    if (exists) {
      const stats = fs.statSync(outputPath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        publicUrl: `/extracted/${songId}_background.mp3`
      };
    }
    
    return { exists: false };
  }

  /**
   * Delete extracted background file
   */
  deleteExtractedBackground(songId) {
    const outputPath = path.join(this.outputDir, `${songId}_background.mp3`);
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      return true;
    }
    return false;
  }
}

module.exports = new BackgroundExtractionService();
