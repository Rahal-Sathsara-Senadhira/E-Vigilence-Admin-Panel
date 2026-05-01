# Cloudflare R2 Evidence Storage Setup

This guide explains how to configure and use Cloudflare R2 for storing evidence files (images, videos, audios) in the E-Vigilance Admin Panel.

## Overview

Evidence files are stored in Cloudflare R2, a cost-effective S3-compatible object storage service. The backend uploads files to R2, and the frontend displays them directly from R2's public URLs.

## Prerequisites

1. **Cloudflare Account** - Sign up at https://www.cloudflare.com/
2. **R2 Bucket** - Create a bucket in Cloudflare Dashboard
3. **API Token** - Generate credentials for programmatic access

---

## Step 1: Create an R2 Bucket

### 1.1 Access Cloudflare Dashboard
- Log in to your Cloudflare account
- Go to **R2** (usually under Storage in the sidebar)

### 1.2 Create New Bucket
- Click **Create Bucket**
- Enter bucket name: `e-vigilance-evidence` (or your preference)
- Select region: Choose closest to your users
- Click **Create Bucket**

### 1.3 Configure Public Access
- Go to bucket settings
- Under **Bucket details**, note the **Bucket name**
- Under **Access Control**, click **Edit public access settings**
- Enable public read access for the bucket
- Note the **Public URL** (format: `https://[bucket-name].[account-id].r2.cloudflarestorage.com`)

---

## Step 2: Generate R2 API Credentials

### 2.1 Create API Token
- In Cloudflare Dashboard, go to **R2**
- Click on your account in top-right → **Account Settings**
- Go to **API Tokens** tab
- Click **Create API Token**

### 2.2 Configure Token Permissions
- **Token name**: `E-Vigilance Evidence Upload`
- **Permissions**: Select `Edit` for R2
- **Resources**: Select your `e-vigilance-evidence` bucket
- **TTL**: Set as needed (or leave unlimited)
- Click **Create Token**

### 2.3 Copy Credentials
The token creation will show:
- **Access Key ID** → `R2_ACCESS_KEY`
- **Secret Access Key** → `R2_SECRET_KEY`
- **Account ID** → `R2_ACCOUNT_ID` (visible in R2 dashboard URL or settings)

---

## Step 3: Configure Environment Variables

### 3.1 Update `.env` File

Add these variables to `Backend/.env`:

```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY=your_access_key_id_here
R2_SECRET_KEY=your_secret_access_key_here
R2_BUCKET_NAME=e-vigilance-evidence
R2_PUBLIC_URL=https://e-vigilance-evidence.[account-id].r2.cloudflarestorage.com
```

### 3.2 Get Your Values

1. **Account ID**: 
   - Go to Cloudflare Dashboard → R2
   - Look at the URL bar: `https://dash.cloudflare.com/?to=/:account/r2`
   - The ID is between slashes
   - OR look in R2 settings under "Bucket details"

2. **Access Key & Secret**: From API Token creation (step 2.3)

3. **Bucket Name**: What you set in Step 1.2

4. **Public URL**: From bucket settings (Step 1.3)

---

## Step 4: Install Dependencies

```bash
cd Backend
npm install
```

This installs:
- `@aws-sdk/client-s3` - AWS SDK for S3-compatible APIs (R2)
- `multer` - File upload handling middleware

---

## Step 5: File Upload API

### Endpoint
```
POST /api/violations/upload-evidence
```

### Request Format
Send a multipart form data request with:
- **images** (optional): Array of image files
- **videos** (optional): Array of video files
- **audios** (optional): Array of audio files

### Example (using curl)
```bash
curl -X POST http://localhost:8081/api/violations/upload-evidence \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.png" \
  -F "videos=@/path/to/video1.mp4" \
  -F "audios=@/path/to/audio1.mp3"
```

### Example (using JavaScript/Fetch)
```javascript
const formData = new FormData();
formData.append('images', imageFile1);
formData.append('images', imageFile2);
formData.append('videos', videoFile1);
formData.append('audios', audioFile1);

const response = await fetch('/api/violations/upload-evidence', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
console.log(data.data);
// Returns: { images: [...urls], videos: [...urls], audios: [...urls] }
```

### Response Format
```json
{
  "ok": true,
  "data": {
    "images": [
      "https://e-vigilance-evidence.xxx.r2.cloudflarestorage.com/evidence/images/1234567890-abc123.jpg",
      "https://e-vigilance-evidence.xxx.r2.cloudflarestorage.com/evidence/images/1234567891-def456.png"
    ],
    "videos": [
      "https://e-vigilance-evidence.xxx.r2.cloudflarestorage.com/evidence/videos/1234567892-ghi789.mp4"
    ],
    "audios": [
      "https://e-vigilance-evidence.xxx.r2.cloudflarestorage.com/evidence/audios/1234567893-jkl012.mp3"
    ]
  },
  "message": "Files uploaded successfully to R2"
}
```

---

## Step 6: Create a Violation with Evidence

### Option A: Create First, Upload Later
1. Create violation without evidence
2. Use upload endpoint to get URLs
3. Update violation with those URLs

### Option B: Full Workflow
```javascript
// 1. Upload files
const uploadRes = await fetch('/api/violations/upload-evidence', {
  method: 'POST',
  body: formData,
});
const { data: urls } = await uploadRes.json();

// 2. Create violation with uploaded URLs
const createRes = await fetch('/api/violations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Traffic Violation',
    type: 'speeding',
    violations: ['exceeding speed limit'],
    description: 'Caught on radar doing 80 in 60',
    location: { lat: 6.9271, lng: 80.7789, dms: 'N06°55\'37" E80°46\'44"' },
    images: urls.images,
    videos: urls.videos,
    audios: urls.audios,
  }),
});

const violation = await createRes.json();
```

---

## File Size & Type Limits

### Images
- **Max per file**: 10 MB
- **Allowed types**: JPEG, PNG, WebP, GIF
- **Max count**: 10 files

### Videos
- **Max per file**: 500 MB
- **Allowed types**: MP4, MPEG, MOV, AVI
- **Max count**: 5 files

### Audios
- **Max per file**: 50 MB
- **Allowed types**: MP3, WAV, OGG, AAC
- **Max count**: 10 files

### Total Upload Limit
- **Max request size**: 500 MB

---

## Frontend Integration

The frontend Evidence Viewer automatically displays files from R2 URLs:

```javascript
<EvidenceViewer
  images={violation.images}     // URLs from R2
  videos={violation.videos}     // URLs from R2
  audios={violation.audios}     // URLs from R2
/>
```

Features:
- ✅ View-only access
- ✅ No download button
- ✅ Right-click disabled
- ✅ Fullscreen image viewer
- ✅ HTML5 video/audio players

---

## Security Best Practices

1. **API Credentials**: Store in `.env`, never commit to Git
2. **Public URL**: Only for reading; writing requires API credentials
3. **File Validation**: Backend validates MIME types and sizes
4. **Unique Names**: Files get random names to prevent conflicts
5. **Caching**: R2 caches files for 1 year (configurable)
6. **Access Control**: Use R2 bucket policies if needed

---

## Troubleshooting

### "Failed to upload file to R2"
- ✓ Check `.env` variables are correct
- ✓ Verify R2 bucket exists and is accessible
- ✓ Check API credentials have correct permissions
- ✓ Ensure file size is within limits

### "Invalid file type"
- ✓ File MIME type must match allowed types
- ✓ Check file extension matches actual format
- ✓ Convert file if needed (e.g., `.jpg` instead of `.jpeg`)

### "Access Denied"
- ✓ Verify R2 credentials in `.env`
- ✓ Check API token permissions include your bucket
- ✓ Ensure bucket public access is enabled for reading

### "Public URL not accessible"
- ✓ Check R2_PUBLIC_URL in `.env` is correct
- ✓ Verify bucket public read access is enabled
- ✓ Wait a few minutes for R2 to sync

---

## Pricing

Cloudflare R2 pricing (as of 2024):
- **Storage**: $0.015 per GB/month
- **Requests**: $0.36 per million requests
- **Egress**: Free! (First 10GB/month included)

See https://www.cloudflare.com/pricing/r2/ for current rates.

---

## Next Steps

1. ✅ Create R2 bucket and get credentials
2. ✅ Update `.env` with your values
3. ✅ Install dependencies: `npm install`
4. ✅ Test upload endpoint
5. ✅ Integrate with frontend form (optional)

---

## References

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Multer Middleware](https://github.com/expressjs/multer)
