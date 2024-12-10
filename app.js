const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getVideoDurationInSeconds } = require('get-video-duration');
const crypto = require('crypto');
const youtubedl = require('youtube-dl-exec');

// Initialize Express
const app = express();

// Directory to save uploaded videos
const uploadDir = path.join(__dirname, 'videos');
const jsonFile = path.join(__dirname, 'suggest_video.json');

// Ensure the upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Read or initialize the JSON file
let videos = [];
if (fs.existsSync(jsonFile)) {
  try {
    videos = JSON.parse(fs.readFileSync(jsonFile, 'utf8')).videos || [];
  } catch (err) {
    console.error('Failed to parse JSON file:', err);
  }
}

// Configure Multer for file uploads
const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'audio/mpeg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only mp4, mov, and mp3 formats are allowed'));
    }
  },
  // Removed file size limit to allow unlimited size
});

// Function to resolve file name conflicts by appending _1, _2, etc.
function getUniqueFileName(dir, fileName) {
  const parsedPath = path.parse(fileName);
  let name = parsedPath.name;
  const ext = parsedPath.ext;
  let counter = 0;

  let uniqueFileName = fileName;
  while (fs.existsSync(path.join(dir, uniqueFileName))) {
    counter++;
    uniqueFileName = `${name}_${counter}${ext}`;
  }

  return uniqueFileName;
}

// API endpoint to upload and extract video info
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { file } = req;

  if (!file) {
    return res.status(400).json({ error: 'File is required' });
  }

  try {
    // Check and resolve file name conflicts
    const uniqueFileName = getUniqueFileName(uploadDir, file.originalname);
    const uniqueFilePath = path.join(uploadDir, uniqueFileName);

    // Rename the uploaded file to the resolved unique name
    fs.renameSync(file.path, uniqueFilePath);

    // Extract video duration
    const duration = await getVideoDurationInSeconds(uniqueFilePath);
    const durationInSeconds = Math.round(duration);

    // Generate a unique random ID
    const videoId = crypto.randomUUID();

    // Remove file extension from the name for the JSON file
    const fileNameWithoutExtension = path.parse(uniqueFileName).name;

    // Add video info to the JSON file
    const newVideo = {
      id: videoId, // Random unique ID
      name: fileNameWithoutExtension, // File name without extension
      description: '',
      duration: durationInSeconds,
      path: `videos/${uniqueFileName}`
    };

    videos.push(newVideo);

    // Save the updated videos array to the JSON file
    const updatedJson = JSON.stringify({ videos }, null, 2);
    fs.writeFileSync(jsonFile, updatedJson, 'utf8');

    res.json({
      status: 'success',
      message: 'File uploaded and video information extracted',
      video: newVideo
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to process the uploaded video',
      details: err.message
    });
  }
});

// API endpoint to extract video information
app.get('/api/extract-info', async (req, res) => {
  const videoUrl = req.query.video_url;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing video_url parameter' });
  }

  try {
    const output = await youtubedl(videoUrl, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    });

    const videoAndAudioFormats = output.formats.filter(
      (format) => format.vcodec !== 'none' && format.acodec !== 'none'
    );

    res.json({
      status: 'success',
      videoTitle: output.title,
      videoAndAudioFormats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process video', details: err.message });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
